import base64
import io
from typing import Literal

import cv2
import numpy as np
from PIL import Image
from pydantic import BaseModel

# This might look wrong on the first glance, but these are the cv2 rotations that need to
# be done to turn the image to the correct position. So they are reversed operations.
_ROT = {
    0: None,
    90: cv2.ROTATE_90_COUNTERCLOCKWISE,
    180: cv2.ROTATE_180,
    270: cv2.ROTATE_90_CLOCKWISE,
}


class RotationResult(BaseModel):
    """Result of rotation detection.

    Attributes:
        angle: Detected rotation in degrees, one of {0, 90, 180, 270}.
        text_boxes: Bounding boxes of detected text regions as (x, y, w, h).
        orientation_mean: Weighted mean ascender/descender asymmetry.
        score_0: Hough line score for the upright orientation.
        score_90: Hough line score for the 90-rotated orientation.
    """

    angle: int
    text_boxes: list[tuple[int, int, int, int]]
    orientation_mean: float
    score_0: int
    score_90: int


class HandwritingResult(BaseModel):
    """Result of handwriting detection.

    Attributes:
        contains_handwriting: Whether the page is classified as containing handwriting.
        counts: Count per class label (e.g. {"handwritten": 3, "printed": 12, "unknown":1}).
        per_region: Per-line results as ((x, y, w, h), label, score).
    """

    contains_handwriting: bool
    counts: dict[str, int]
    per_region: list[tuple[tuple[int, int, int, int], str, float]]


class PageImage:
    """Page image and mathematical preprocessing functions.

    Attributes:
        colour: Colour page, uint8
        gray: Grayscale page, uint8.
        gray_r: gray rotated 90 degrees counter-clockwise.
        fg_mask: Otsu-binarised inverted image (ink = 255), uint8.
        fg_mask_r: Foreground mask rotated 90 degrees counter-clockwise.
    """

    def __init__(self, b64: str):
        """Load from base64."""
        self.colour = cv2.imdecode(np.frombuffer(base64.b64decode(b64, validate=True), np.uint8), cv2.IMREAD_COLOR)
        self.gray = cv2.cvtColor(self.colour, cv2.COLOR_BGR2GRAY)
        _, self.fg_mask = cv2.threshold(self.gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        self.gray_r = cv2.rotate(self.gray, cv2.ROTATE_90_COUNTERCLOCKWISE)
        self.fg_mask_r = cv2.rotate(self.fg_mask, cv2.ROTATE_90_COUNTERCLOCKWISE)

    def rotate(self, degrees: Literal[0, 90, 180, 270]) -> "PageImage":
        """Rotate all internal buffers counter-clockwise in place.
        Rotates ``colour``, ``gray``, ``fg_mask`` and their ``_r`` counterparts.
        """
        if degrees not in _ROT:
            raise ValueError("degrees must be one of 0, 90, 180, 270")
        code = _ROT[degrees]
        if code is not None:
            self.colour = cv2.rotate(self.colour, code)
            self.gray = cv2.rotate(self.gray, code)
            self.fg_mask = cv2.rotate(self.fg_mask, code)
            self.gray_r = cv2.rotate(self.gray_r, code)
            self.fg_mask_r = cv2.rotate(self.fg_mask_r, code)
        return self

    def find_text_lines(self, fg_mask: np.ndarray) -> list[tuple[int, int, int, int]]:
        """Extract text-line bboxes via horizontal morphological closing."""
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (35, 2))
        closed = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
        n, _, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
        h_img, w_img = fg_mask.shape
        boxes = []
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if h < 6 or h > h_img * 0.18 or w < h * 2 or w > w_img * 0.98 or area < 35:
                continue
            boxes.append((x, y, x + w, y + h))
        return sorted(boxes, key=lambda b: b[1])

    def hough_axis_counts(self, fg_mask: np.ndarray, gray: np.ndarray) -> tuple[int, int]:
        """Count horizontal and vertical Hough segments in text-like regions."""
        # The morph_rect can be adjusted to increase accuracy for the hough lines.
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 10))
        closed = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
        n, _, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
        edges = cv2.Canny(gray, 50, 150)
        h_total = v_total = 0
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if area < 200 or w < 30:
                continue
            region = edges[y : y + h, x : x + w]
            if (region > 0).mean() > 0.18:
                continue
            lines = cv2.HoughLinesP(region, 1, np.pi / 180, 30, minLineLength=15, maxLineGap=6)
            if lines is None:
                continue
            dx = lines[:, 0, 2] - lines[:, 0, 0]
            dy = lines[:, 0, 3] - lines[:, 0, 1]
            angles = np.abs(np.degrees(np.arctan2(dy, dx)))
            h_total += int(np.sum((angles < 20) | (angles > 160)))
            v_total += int(np.sum((angles > 70) & (angles < 110)))
        return h_total, v_total

    def to_light_on_ocr_b64(self, target_long_side: int = 1540) -> str:
        """Encode the page as base64 PNG resized to the LightOnOCR input spec.
        Resizes so the long side equals ``target_long_side`` (default 1540 px,
        matching the ~200 DPI guidance from the LightOnOCR README).
        """
        img = self.colour
        h, w = img.shape[:2]
        scale = target_long_side / max(h, w)
        if scale < 1.0:
            img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        elif scale > 1.5:
            img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_CUBIC)

        pil_image = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


class RotationDetector:
    """Detect page rotation in {0, 90, 180, 270} degrees.

    Axis (0 vs 90) comes from Hough line totals on upright and rotated views.
    Flip (0 vs 180) comes from ascender/descender asymmetry of text lines:
    Latin script has more ink above the x-height band than below.
    """

    def __init__(
        self,
        page: PageImage,
        flip_threshold: float = 0.05,
        rotation_threshold: float = 0.05,
    ):
        """Initialize the detector.

        Args:
            page: PageImage to analyze.
            flip_threshold: Min weighted mean asymmetry to trigger a 180-flip.
            rotation_threshold: Min ratio between the two axis scores to pick
                90 over 0 (or vice versa); below this, axis is treated as
                ambiguous and defaults to 0.
        """
        self.page = page
        self.flip_threshold = flip_threshold
        self.rotation_threshold = rotation_threshold

    def detect(self) -> RotationResult:
        """Run the full rotation pipeline."""
        base_angle, score_0, score_90 = self._vote_base_axis()
        fg_mask = self.page.fg_mask_r if base_angle == 90 else self.page.fg_mask

        boxes = self.page.find_text_lines(fg_mask)
        scores = [self._orientation_score(fg_mask[y0:y1, x0:x1]) for x0, y0, x1, y1 in boxes]
        weights = [x1 - x0 for x0, _, x1, _ in boxes]
        mean = float(np.average(scores, weights=weights)) if scores else 0.0
        if base_angle == 0:
            angle = (base_angle + 180) % 360 if mean > self.flip_threshold else base_angle
        else:
            angle = (base_angle + 180) % 360 if mean > 0 else base_angle

        return RotationResult(
            angle=angle,
            text_boxes=boxes,
            orientation_mean=mean,
            score_0=score_0,
            score_90=score_90,
        )

    def _vote_base_axis(self) -> tuple[int, int, int]:
        """Vote between 0 and 90 degrees using Hough totals."""
        h0, v0 = self.page.hough_axis_counts(self.page.fg_mask, self.page.gray)
        h1, v1 = self.page.hough_axis_counts(self.page.fg_mask_r, self.page.gray_r)
        score_0 = h0 + v1
        score_90 = v0 + h1
        total = score_0 + score_90
        if total == 0 or (score_90 - score_0) / total < self.rotation_threshold:
            return 0, score_0, score_90
        return 90, score_0, score_90

    def _orientation_score(self, band: np.ndarray) -> float:
        """Score one text line's ascender/descender asymmetry."""
        rows = band.sum(axis=1).astype(float)
        if rows.sum() == 0:
            return 0.0
        ink = np.where(rows > 0)[0]
        if len(ink) < 4:
            return 0.0
        top, bot = ink[0], ink[-1]
        height = bot - top + 1

        peak = rows.max()
        dense = np.where(rows > peak * 0.5)[0]
        if len(dense) < 2:
            return 0.0
        d_top, d_bot = dense[0], dense[-1]

        above = rows[top:d_top].sum()
        below = rows[d_bot + 1 : bot + 1].sum()
        total = above + below
        if total < peak * 0.5:
            return 0.0

        mass_ratio = (below - above) / total
        span_ratio = (bot - d_bot) / height - (d_top - top) / height
        return 0.6 * mass_ratio + 0.4 * span_ratio


class HandwritingDetector:
    """Detect handwriting at the text-line level.

    Two per-line features vote: baseline roughness (how much the bottom-of-ink
    wobbles from a straight line) and x-height CV (how much component heights
    vary). This detector is a rough estimate with low F1; significant
    improvement is possible.
    """

    def __init__(
        self,
        page: PageImage,
        baseline_threshold: float = 0.1,
        xheight_cv_threshold: float = 0.3,
        ratio_threshold: float = 0.15,
        min_hw_lines: int = 4,
        min_line_width: int = 80,
    ):
        """Initialize the detector.

        Args:
            page: Shared PageImage.
            baseline_threshold: Min baseline roughness to call a line handwritten.
            xheight_cv_threshold: Min x-height CV to call a line handwritten.
            ratio_threshold: Min hw / (hw + printed) for the dominant-text-type rule.
            min_hw_lines: Min handwritten line count for the dominant-text-type rule.
            min_line_width: Drops page numbers, stray marks, and other short fragments.
        """
        self.page = page
        self.baseline_threshold = baseline_threshold
        self.xheight_cv_threshold = xheight_cv_threshold
        self.ratio_threshold = ratio_threshold
        self.min_hw_lines = min_hw_lines
        self.min_line_width = min_line_width

    def detect(self) -> HandwritingResult:
        """Score every text line and aggregate a page-level verdict."""
        counts = {"printed": 0, "handwritten": 0, "unknown": 0}
        per_region: list[tuple[tuple[int, int, int, int], str, float]] = []

        for x0, y0, x1, y1 in self.page.find_text_lines(self.page.fg_mask):
            w = x1 - x0
            if w < self.min_line_width:
                continue
            crop = self.page.fg_mask[y0:y1, x0:x1]
            label, score = self._classify_line(crop)
            counts[label] += 1
            per_region.append(((x0, y0, w, y1 - y0), label, score))

        return HandwritingResult(
            contains_handwriting=self._aggregate(counts),
            counts=counts,
            per_region=per_region,
        )

    def _classify_line(self, crop: np.ndarray) -> tuple[str, float]:
        """Label a single text line as printed, handwritten, or unknown."""
        rough = self._baseline_roughness(crop)
        xcv = self._xheight_cv(crop)
        if rough is None or xcv is None:
            return "unknown", 0.0
        if rough > self.baseline_threshold and xcv > self.xheight_cv_threshold:
            return "handwritten", rough
        return "printed", rough

    def _aggregate(self, counts: dict[str, int]) -> bool:
        """Combine per-line counts into a page-level flag."""
        hw, pr, unknown = counts["handwritten"], counts["printed"], counts["unknown"]
        ratio = hw / (hw + pr) if hw + pr > 0 else 0.0
        dominant = ratio >= self.ratio_threshold and hw >= self.min_hw_lines
        heavy = hw >= 2 and hw > pr
        messy = hw >= 1 and unknown >= 10 and unknown > pr * 3
        return dominant or heavy or messy

    def _baseline_roughness(self, line_fg_mask: np.ndarray) -> float | None:
        """Residual std of a linear fit through bottom-of-ink per column."""
        h, w = line_fg_mask.shape
        if h < 8 or w < 40:
            return None
        xs, bottoms = [], []
        for x in range(0, w, 2):
            rows = np.where(line_fg_mask[:, x])[0]
            if rows.size:
                xs.append(x)
                bottoms.append(rows[-1])
        if len(bottoms) < 20:
            return None
        xs_a = np.array(xs, dtype=float)
        ys_a = np.array(bottoms, dtype=float)
        slope, intercept = np.polyfit(xs_a, ys_a, 1)
        residuals = ys_a - (slope * xs_a + intercept)
        return float(residuals.std() / h)

    def _xheight_cv(self, line_fg_mask: np.ndarray) -> float | None:
        """Coefficient of variation of component heights in a line."""
        n, _, stats, _ = cv2.connectedComponentsWithStats(line_fg_mask, connectivity=8)
        if n < 6:
            return None
        heights = stats[1:, cv2.CC_STAT_HEIGHT].astype(float)
        areas = stats[1:, cv2.CC_STAT_AREA]
        heights = heights[(heights >= 4) & (areas >= 10)]
        if heights.size < 5:
            return None
        mean = heights.mean()
        return float(heights.std() / mean) if mean > 0 else None

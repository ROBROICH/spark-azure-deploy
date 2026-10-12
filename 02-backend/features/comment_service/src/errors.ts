import { defineErrorCatalog } from "evlog";

export const commentErrors = defineErrorCatalog("comment", {
  NOT_FOUND: {
    status: 404,
    message: "Comment not found",
    why: "The requested comment does not exist in this project",
    fix: "Refresh the project and use an existing comment",
  },
});

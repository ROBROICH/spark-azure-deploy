---
ruleId: clean-code/references/cohesive-feature-owner-examples
---

# Cohesive Feature Owner Examples

## Bad Example

```tsx
export const MainPage = () => {
  const { search, filters, sorting } = useProjectsScreen();

  return (
    <>
      <ProjectsTableToolbar
        search={search}
        filters={filters}
        sorting={sorting}
      />
      <ProjectsTable
        search={search}
        filters={{
          ...filters,
          onTypeFilterChange: () => {},
          onStatusFilterChange: () => {},
        }}
        sorting={sorting}
        showToolbar={false}
      />
    </>
  );
};
```

## Good Example

```tsx
export const ProjectsTableSection = () => {
  const state = useProjectsTableSection();

  return (
    <section className="flex flex-col gap-4 rounded-md border p-4">
      <ProjectsTableToolbar {...state.toolbar} />
      <ProjectsTableGrid {...state.grid} />
    </section>
  );
};
```

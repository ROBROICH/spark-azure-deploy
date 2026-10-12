# Auth macro

Auth is a basic app concern. This reference covers how you can use auth in your routes

```ts
export default createController("account").get("/account/me", ({ user, session }) => user, {
  auth: true, // This makes it so user and session are accessible
});
```

## Rules

- Routes should not parse `Authorization`, cookies, or session IDs manually.
- Routes should not import auth directly

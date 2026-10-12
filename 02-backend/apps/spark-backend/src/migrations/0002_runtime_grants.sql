-- Grants for the runtime role of the application database. Its name differs per
-- deployment (application, testing_application, <env>-application), so the grant targets
-- current_database(). Deployments without a separate runtime role (one user
-- owns and uses the database) skip it.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'application_runtime') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO application_runtime', current_database());
    GRANT USAGE ON SCHEMA public TO application_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO application_runtime;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO application_runtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO application_runtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO application_runtime;
  END IF;
END
$$;

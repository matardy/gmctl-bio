-- Runs once, on first container start (empty volume).
-- Separate database for `npm run test:db` so tests never touch dev data.
CREATE DATABASE personal_web_test;

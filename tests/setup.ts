import "@testing-library/jest-dom/vitest";

// Dummy env so modules that construct model instances (LangChain providers)
// can be imported under test without real credentials. Real values (if
// present) are preserved. The Postgres pool is lazy, so unit tests need no DB.
process.env.OPENROUTER_API_KEY ||= "test-openrouter-key";

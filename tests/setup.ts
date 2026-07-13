import "@testing-library/jest-dom/vitest";

// Dummy env so modules that construct clients at import time (Supabase) or
// model instances (LangChain providers) can be imported under test without
// real credentials. Real values (if present) are preserved.
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.ANTHROPIC_API_KEY ||= "test-anthropic-key";
process.env.NVIDIA_API_KEY ||= "test-nvidia-key";
process.env.OPENROUTER_API_KEY ||= "test-openrouter-key";

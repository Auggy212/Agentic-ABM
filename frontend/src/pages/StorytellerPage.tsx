export function StorytellerPage() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-slate-900">Storyteller Page</h3>
      <p className="mt-2 text-sm text-slate-600">
        Connect to GET /api/messages/{'{contactId}'} - use mock data from src/mocks/data.ts in development.
      </p>
    </section>
  );
}

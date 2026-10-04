(function () {
  "use strict";

  const projectUrl = "https://ufsegzkdklwgizqkdayz.supabase.co";
  const publishableKey = "sb_publishable_ORXSpXyKn7EY-2PDI9NbAg_c1uv-YMD";

  if (
    projectUrl === "YOUR_SUPABASE_PROJECT_URL" ||
    publishableKey === "YOUR_SUPABASE_PUBLISHABLE_KEY"
  ) {
    console.warn(
      "Ten Grand Supabase is ready to configure. Add the Project URL and Publishable Key in assets/js/supabase.js."
    );
    return;
  }

  window.tenGrandSupabase = window.supabase.createClient(
    projectUrl,
    publishableKey
  );

  async function testSupabaseConnection() {
    const { data, error } = await window.tenGrandSupabase
      .from("voices_heard")
      .select("*")
      .eq("status", "approved");

    console.log("Ten Grand Supabase connection test", { data, error });
  }

  testSupabaseConnection();
})();

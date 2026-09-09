export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/companies?select=*`,
      {
        headers: {
          apikey: process.env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({
        error: error,
      });
    }

    const companies = await response.json();

    return res.status(200).json({
      success: true,
      count: companies.length,
      companies: companies,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
}

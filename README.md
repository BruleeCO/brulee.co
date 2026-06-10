# Brulee static site

Static GitHub Pages export of the public WordPress site at https://brulee.co/.

## Deploying

Serve the repository root with GitHub Pages. The `CNAME` file points Pages at `brulee.co`, and `.nojekyll` keeps WordPress-style asset paths intact.

## Notes

This is a static mirror. WordPress server features such as admin AJAX, native WP search, private calendar backends, comments, and WPForms submission endpoints are preserved in markup where they existed, but they will not run on GitHub Pages without replacing them with static-friendly services.

## Brulee Interview

The interview experience lives at `/interview/`. It works locally with a built-in interviewer, and it can use Gemini through the Supabase Edge Function in `supabase/functions/brulee-interview`.

Do not put a Gemini API key in GitHub Pages HTML or JavaScript. Create a Brulee-specific key in Google Cloud, then store it server-side:

```sh
gcloud auth login
SUPABASE_PROJECT_REF=your-ref scripts/create-brulee-gemini-key.sh
supabase functions deploy brulee-interview
```

After deployment, set the empty `brulee-interview-endpoint` meta tag in `interview/index.html` to the Supabase function URL.

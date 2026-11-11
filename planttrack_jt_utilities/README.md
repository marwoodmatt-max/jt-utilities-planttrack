# JT Utilities LTD – PlantTrack starter

This is the initial web application starter for the JT Utilities PlantTrack project.

## Included
- Responsive Next.js dashboard with black/red/white branding.
- Navigation for plant register, calendar, plant checks, LOLER, workshop job cards, history, users and reports.
- Example records clearly intended as demo data.
- Initial Supabase database schema.
- Company logo in `public/jt-utilities-logo.jpg` (if supplied).

## Run locally
1. Install Node.js 20 or newer.
2. Extract this folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

## Supabase setup
1. Create a Supabase project and select London (`eu-west-2`) if available for your account.
2. Run `supabase/schema.sql` in the SQL editor.
3. Configure and test row-level security policies before enabling any user access.
4. Copy the project URL and public anon/publishable key into `.env.local` using `.env.example` as a guide.
5. Never put a Supabase service-role key in browser code or commit secrets to source control.

## Vercel deployment
1. Push this project to a private Git repository owned by JT Utilities.
2. Import the repository into Vercel.
3. Add the required environment variables.
4. Deploy and test the preview deployment.
5. Add `planttrack.jtutilities.com` in Vercel project domain settings.
6. Add only the DNS record Vercel instructs you to add at the existing DNS provider. Do not replace nameservers or disturb existing website/email records.
7. Verify HTTPS and production access.

## Important: not production-ready yet
This is a front-end starter and initial schema, not a live hosted service. Demo figures and example job cards are not real company records. Authentication UI, role-based RLS policies, server-side validation, immutable audit enforcement, file upload permissions, notification delivery, offline sync, and full workflow persistence must be implemented and security-tested before production use. LOLER examination decisions and statutory records must remain under the control of appropriately competent persons.

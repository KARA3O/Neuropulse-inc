# Neuropulse Inc. website

A static site (HTML, CSS, JavaScript). No install or build step needed.

## Run it in VS Code
1. Unzip, then in VS Code choose File > Open Folder and pick `neuropulse-site`.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` and choose **Open with Live Server**. The site opens in your browser and refreshes when you save.

No extension? Run `npx serve` in the folder, or just double-click `index.html`.

## Files
- `index.html` is the page content (hero, services, projects, process, contact).
- `css/style.css` holds the colours (CSS variables at the top) and layout.
- `js/main.js` builds the contact email and sets the footer year.
- `assets/` has the favicon and logos.

## Things to change
- Contact email: `info@neuropulseinc.com` appears in `index.html` and `js/main.js`.
- Projects: copy a `.card` block inside the `#projects` section to add a project.
- The form opens the visitor's email app (no server). To save enquiries, you need a backend, which is the next step.

## Publish later
Upload the folder to Netlify, Vercel or GitHub Pages, then point `neuropulseinc.com` at it.

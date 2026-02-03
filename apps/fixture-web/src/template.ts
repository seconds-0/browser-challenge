export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
    .hidden { display: none; }
    .card { background: white; padding: 24px; border-radius: 8px; }
  </style>
</head>
<body data-level="${title}">
${body}
</body>
</html>`;
}

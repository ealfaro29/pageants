/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                app: {
                    bg: 'var(--color-app-bg)',
                    card: 'var(--color-app-card)',
                    border: 'var(--color-app-border)',
                    text: 'var(--color-app-text)',
                    muted: 'var(--color-app-muted)',
                    accent: 'var(--color-app-accent)'
                }
            }
        },
    },
    plugins: [],
}

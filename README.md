# Damsels - Static Assets

Static site built with [Zola](https://www.getzola.org/), a fast Rust-based static site generator.

## Prerequisites

- [Zola](https://www.getzola.org/documentation/getting-started/installation/) (0.18+)

## Development

```bash
# Serve locally with hot reload
zola serve
```

Visit `http://127.0.0.1:1111`

## Build

```bash
# Build to /build directory
zola build
```

## Project Structure

```
damsels-assets/
├── config.toml          # Zola configuration
├── content/             # Markdown content files
│   └── _index.md        # Homepage content
├── templates/           # Tera HTML templates
│   ├── base.html        # Base layout
│   └── index.html       # Homepage template
├── sass/                # SCSS stylesheets (compiled by Zola)
│   └── main.scss
├── static/              # Static files (copied as-is)
└── build/               # Generated output (gitignored)
```

## Adding Pages

Create a new `.md` file in `content/`:

```markdown
+++
title = "Page Title"
template = "page.html"
+++

Your content here.
```

## Related Repositories

- **damsels-pingora** — Infrastructure (Helm charts, K8s manifests)
- **damsels-spacetimedb** — Game backend (Rust + SpacetimeDB)


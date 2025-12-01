# Search Tools

Headless Google search and content extraction. Runs in background without affecting your GUI Chrome.

## How to Invoke

**CRITICAL**: Invoke directly, no `node` or `./` prefix:

```bash
./search.js "query"      # ✓ correct
node search.js         # ✗ wrong
```

## Search Google

```bash
./search.js "rust programming"
./search.js "query" -n 10            # more results
./search.js "query" --content        # include page content
```

If CAPTCHA appears, run with `--setup` to solve it once in a visible browser.

## Extract Page Content

```bash
./content.js https://example.com
```

Extracts readable content as markdown.

## Search + Content Strategies

Use `--content` to fetch all results at once:
```bash
./search.js "climate change" -n 3 --content
```

Or search first, then selectively fetch:
```bash
./search.js "climate change" -n 10
# Review results, then fetch specific ones:
./content.js https://relevant-article.com
```

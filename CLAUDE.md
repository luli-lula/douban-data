# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Douban data synchronization repository that automatically fetches movie/book marking records from Douban (all statuses: done/doing/mark) and stores them as JSON for use in a Hugo static site via GitHub Pages.

## Commands

- `node scripts/sync-douban.js movie` - Sync movie data from Douban API → `data/movies.json`
- `node scripts/sync-douban.js book` - Sync book data from Douban API → `data/books.json`
- `node scripts/sync-douban.js all` - Sync both movies and books

### Manual Workflow Triggers
- GitHub Actions → "Sync Douban Movies" → "Run workflow"
- GitHub Actions → "Sync Douban Books" → "Run workflow"

## Architecture

### Data Flow

1. **GitHub Actions Workflows** run weekly (Sunday UTC 16:00 movies, UTC 17:00 books)
2. **`sync-douban.js`** calls Douban Frodo API directly, paginates using `total` field, outputs JSON
3. **Incremental merge**: new records added, existing records preserved, status updated
4. **Image Management** - Downloads posters/covers for 5-star items, serves via jsDelivr CDN
5. **Auto-commit** pushes all data to repository

### Key Files

- `scripts/sync-douban.js` - Single sync script (replaces doumark-action + CSV processing)
- `data/movies.json` - All movie data (all statuses, all ratings)
- `data/books.json` - All book data (all statuses, all ratings)
- `data/movie-stats.json` / `data/book-stats.json` - Sync metadata and statistics
- `images/movies/` / `images/books/` - Downloaded poster/cover images

### Data Structure

**Movies** (`data/movies.json`):
- Fields: `title`, `year`, `rating`, `status`, `directors`, `genres`, `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`
- `status`: `done` (watched), `doing` (watching), `mark` (want to watch)
- `poster_url` uses jsDelivr CDN for 5-star movies with downloaded posters

**Books** (`data/books.json`):
- Fields: `title`, `year`, `rating`, `status`, `author`, `publisher`, `genres`, `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`
- `status`: `done` (read), `doing` (reading), `mark` (want to read)

### External Dependencies
- **Douban User ID**: 59715677
- **Douban Frodo API**: `frodo.douban.com/api/v2/user/{id}/interests`
- **Hugo Site**: Data consumed at `https://raw.githubusercontent.com/luli-lula/douban-data/main/data/{movies,books}.json`
- **Hugo Templates**: `douban-movies.html` and `douban-books.html` shortcodes in luli-lula.github.io repo

## Development Notes

- Pure Node.js, no external npm dependencies
- **Incremental Updates**: Only adds new items; updates status for existing items
- **API Pagination**: Uses `total` field from Douban API response (not timestamp-based)
- **Rate Limiting**: 2s delay between API requests
- **Backward Compatibility**: Field names match Hugo template expectations (`author` not `authors`, `poster_url` not `cover_url`)

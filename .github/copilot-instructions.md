# Copilot Instructions for appMediaPipe

## Project Overview

**formcheck** is a React 19 + Vite web application designed to work with MediaPipe for form validation and analysis. The app uses modern tooling with hot module replacement (HMR) for efficient development.

## Build & Development Commands

### Development
- **Start dev server with HMR**: `npm run dev`
  - Vite development server runs on http://localhost:5173 (by default)
  - Changes auto-reload in browser

### Production
- **Build for production**: `npm run build`
  - Outputs optimized bundle to `dist/` directory
- **Preview production build locally**: `npm run preview`
  - Serves the built dist folder to test production build

### Code Quality
- **Lint code**: `npm run lint`
  - Runs ESLint on all `.js` and `.jsx` files
  - Uses recommended configs + React hooks plugin + React refresh plugin

## Architecture

### Tech Stack
- **Framework**: React 19 with React DOM
- **Build Tool**: Vite (ES module bundler)
- **Styling**: CSS modules (each component has corresponding `.css` file)
- **Linting**: ESLint with React-specific rules

### Directory Structure
```
src/
├── main.jsx          - React app entry point
├── App.jsx           - Root component (currently template)
├── App.css           - Root component styles
├── index.css         - Global styles
└── assets/           - Static assets (images, icons, logos)
```

### Core Patterns

1. **File Organization**: Each React component (`App.jsx`) has a co-located CSS file (`App.css`)
2. **React Hooks**: Project includes `eslint-plugin-react-hooks` - ensure hooks follow the rules of hooks
3. **HMR-Friendly Code**: Use React Refresh patterns; avoid default exports in hot-reloaded modules where possible
4. **Entry Point**: `src/main.jsx` uses `createRoot()` from React 18+, renders to `#root` DOM element in `index.html`

## Key Conventions

1. **Component Structure**: Functional components only (no class components)
2. **File Extensions**: Use `.jsx` for files containing JSX, `.js` for pure JavaScript
3. **CSS Scoping**: Global styles in `index.css`, component-specific styles in component `.css` files
4. **Assets**: Import assets in components rather than referencing via hardcoded paths
5. **ESLint Rules Enforced**:
   - React hooks rules (exhaustive dependencies, valid hook usage)
   - React refresh compatibility
   - Recommended JS best practices

## Common Tasks

### Creating a New Component
1. Create `src/MyComponent.jsx` with functional component
2. Create `src/MyComponent.css` for styles
3. Import and use in parent component
4. Run `npm run lint` to check for violations

### Running Development
```bash
npm run dev
# Edit src/App.jsx and save - HMR will refresh the browser
```

### Preparing for Production
```bash
npm run lint     # Fix any linting issues
npm run build    # Generate dist/
npm run preview  # Test the production build
```

## Dependencies

- **react**: ^19.2.7
- **react-dom**: ^19.2.7
- **vite**: ^8.1.1
- **eslint**: ^10.6.0 with related plugins

See `package.json` for complete dependency tree and versions.

## Notes

- The React Compiler is **not enabled** by default to avoid dev/build performance impact
- Only official Vite React plugins are used (@vitejs/plugin-react with Oxc)
- No TypeScript configured - using plain JavaScript/JSX

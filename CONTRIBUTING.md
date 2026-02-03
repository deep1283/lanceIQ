# Contributing to LanceIQ

Thank you for your interest in contributing to LanceIQ! We welcome contributions from everyone.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lanceIQ.git
   cd lanceIQ
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set up environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```
5. **Run the development server**:
   ```bash
   npm run dev
   ```

## Making Changes

1. Create a new branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Test your changes locally
4. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add amazing feature"
   ```

### Commit Message Types
- `feat:` — A new feature
- `fix:` — A bug fix
- `docs:` — Documentation only changes
- `style:` — Code style changes (formatting, semicolons, etc.)
- `refactor:` — Code changes that neither fix bugs nor add features
- `test:` — Adding or updating tests
- `chore:` — Build process or auxiliary tool changes

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
2. Open a Pull Request against the `main` branch
3. Describe your changes clearly in the PR description
4. Wait for review and address any feedback

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- Run `npm run lint` before submitting

## Questions?

Feel free to open an issue if you have questions or need help getting started.

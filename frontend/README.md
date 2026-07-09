## Getting Started

First, ensure you have installed dependencies in the root of the repository to link the shared types package:

```bash
# In the project root
npm install
```

### Environment Configuration

The frontend uses Next.js environment variable handling. Copy `.env.example` to `.env.local` and adjust as needed:

```bash
cp .env.example .env.local
```

Next.js automatically loads `.env.local` files. The frontend expects:

- `NEXT_PUBLIC_API_URL` - API base URL for backend requests (default: `http://localhost:5100`)
- `NEXT_PUBLIC_INSTANCE_NAME` - Optional instance name for multi-instance deployments

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

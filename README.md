# 🚀 Next.js Personal Portfolio & CV Builder

![License](https://img.shields.io/github/license/hiko/next-ts)
![Next.js](https://img.shields.io/badge/Next.js-13.4-black?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)
![MongoDB](https://img.shields.io/badge/MongoDB-GridFS-green?style=flat&logo=mongodb)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker)

A high-performance, secure, and fully customizable personal landing page and CV management system built with Next.js and TypeScript. This project features a robust Admin Dashboard, a drag-and-drop CV editor, real-time data integration (GitHub, Crypto), and a comprehensive MongoDB backup/restore system.

---

## 📑 Table of Contents

- [✨ Key Features](#-key-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [📂 Project Structure](#-project-structure)
- [⚙️ Prerequisites](#️-prerequisites)
- [🚀 Getting Started](#-getting-started)
- [🔧 Configuration](#-configuration)
- [🐳 Docker Deployment](#-docker-deployment)
- [🛡️ Security](#️-security)
- [📄 License](#-license)

---

## ✨ Key Features

### 🎨 Core Frontend
- **Modern UI/UX**: Built with **Chakra UI** and **Tailwind CSS** for responsive design.
- **Dynamic Content**: All content is driven by JSON configuration files (`cvdata.json`, `home.json`) or database entries.
- **Animations**: Smooth page transitions and interactive elements powered by **Framer Motion**.
- **Internationalization (i18n)**: Native support for multiple languages (e.g., English, Chinese).
- **Theme Support**: Dark/Light mode toggle with persistence.

### 🛠️ Admin & CV Builder
- **GUI Editor V2**: A powerful drag-and-drop interface to edit your CV structure, skills, and experience in real-time.
- **Admin Dashboard**: Centralized control panel for site settings, user management, and content updates.
- **Database Integration**:
  - **Full Site Backup**: One-click backup of all configurations (CV, Home, Admin) and media files (images) to MongoDB.
  - **Restore Capability**: Seamlessly restore your site to a previous state from the database.
  - **GridFS Support**: Efficient storage and retrieval of large media files directly from MongoDB.

### 🔌 Integrations & Widgets
- **GitHub Activity**: Real-time feed of your public GitHub contributions and top repositories using the GitHub API.
- **Crypto Ticker**: Live cryptocurrency price updates (e.g., Binance WebSocket integration).
- **Tech Stack Cloud**: Visual representation of your skills based on `package.json` or manual input.

### 🛡️ Enterprise-Grade Security
- **Authentication**: Secure JWT-based authentication for admin access.
- **Security Headers**: Strict **Content-Security-Policy (CSP)**, `X-Frame-Options`, and `HSTS` configured in `next.config.js`.
- **Rate Limiting**: Protection against abuse on sensitive endpoints (login, API routes).
- **Input Validation**: Robust validation using `formik` and `zod` (or similar schemas) to prevent injection attacks.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 13+](https://nextjs.org/) (React)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Chakra UI](https://chakra-ui.com/), [Tailwind CSS](https://tailwindcss.com/), [Sass](https://sass-lang.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) (using native driver & GridFS)
- **State Management**: React Context API (`authState`, `cvDataState`)
- **Forms**: React Hook Form / Formik
- **Utilities**: `axios`, `moment`, `luxon`, `framer-motion`
- **Deployment**: Docker, Docker Compose

---

## 📂 Project Structure

```bash
.
├── api/                # Backend API logic (extracted handlers)
├── components/         # Reusable React components
│   ├── Admin/          # Admin dashboard & CV Editor components
│   ├── LandingPage/    # Main landing page widgets
│   └── ...
├── context/            # Global state (Auth, CV Data)
├── data/               # JSON Configuration files (Source of Truth)
│   ├── cvdata.json     # Resume content
│   ├── home.json       # Landing page settings
│   └── admin.json      # Admin user credentials
├── docker/             # Docker configuration files
├── pages/              # Next.js Pages & API Routes
│   ├── admin/          # Protected admin routes
│   ├── api/            # Serverless API endpoints
│   └── ...
├── public/             # Static assets (images, locales)
├── services/           # API service layers (Auth, REST)
└── styles/             # Global styles (CSS/SCSS)
```

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **Yarn** (v1.22+) or **npm**
- **MongoDB** (Local instance or Atlas URI)
- **Docker** (Optional, for containerized deployment)

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/next-ts.git
cd next-ts
```

### 2. Install Dependencies

```bash
yarn install
# or
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory based on `.env.example`:

```env
# Required
ADMIN_EMAIL=admin@example.com
ADMIN_PASS=your_secure_password
JWT_SECRET=complex_secret_key_here

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/your_db_name
MONGODB_DB=your_db_name

# Optional
GITHUB_TOKEN=your_github_personal_access_token # For higher API rate limits
ENABLE_DEMO=false # Set to true to enable demo routes
```

### 4. Run Development Server

```bash
yarn dev
```

Visit `http://localhost:3000` to see your application.
Access the Admin Panel at `http://localhost:3000/admin` (Login with credentials from `.env`).

---

## 🔧 Configuration

The application allows extensive configuration via JSON files in the `data/` directory.

### `data/cvdata.json`
Controls the content of your CV/Resume page.
- **Structure**: Sections like `experience`, `education`, `skills`.
- **Bilingual**: Supports multi-language fields if configured.

### `data/home.json`
Controls the landing page appearance.
- **Hero Section**: Title, subtitle, background settings.
- **Social Links**: GitHub, LinkedIn, Email urls.
- **Feature Toggles**: Enable/disable widgets like the Crypto ticker or GitHub feed.

### `data/mongo_config.json`
Generated by the application to store active database connection settings if dynamic switching is enabled.

---

## 🐳 Docker Deployment

The project includes a production-ready `Dockerfile` and `docker-compose.yml`.

### Build and Run with Docker Compose

```bash
# Build the image
docker-compose build

# Start the services
docker-compose up -d
```

### Manual Docker Build

```bash
# Build image
docker build -t next-ts-app .

# Run container
docker run -p 3000:3000 --env-file .env next-ts-app
```

### Helper Scripts
- `./build.sh`: Compiles the project locally.
- `./deploy.sh`: Generic deployment script.
- `./docker_compose.sh`: Helper for docker-compose operations.

---

## 🛡️ Security

This project takes security seriously:

1.  **JWT Authentication**: Stateless authentication for the admin panel.
2.  **Middleware Protection**: `middleware.ts` handles route protection and redirection.
3.  **CSP Headers**: Strict Content Security Policy blocks unauthorized scripts and styles.
4.  **Secure Cookies**: Cookies are set with `HttpOnly`, `Secure`, and `SameSite` attributes in production.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

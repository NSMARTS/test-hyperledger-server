# Potatocs Server

This is a backend Express.js server with MongoDB and CORS setup.

## Features

-   Environment support: `development`, `production`, `staging`
-   CORS for specific origins
-   MongoDB integration
-   Static file serving for front-end
-   API routes under `/api/v1`

---

## Installation

1. Clone the repository:
    ```bash
    git clone <repository-url>
    cd <project-root>
    ```
2. Install dependencies:
    ```bash
    npm install
    ```
3. Setup `.env` files in `/env` directory:
    ```env
    PORT=3000
    NODE_ENV=development
    MONGO_URI=mongodb://localhost:27017/<db-name>
    ```

---

## Run the Server

-   **Development:** `npm run dev`
-   **Production:** `npm run prod`
-   **Test:** `npm run test`

---

## CORS

Allowed origins:

-   `http://localhost:4200`
-   `http://192.168.0.8:4200`

Update `allowedOrigins` in `server.js` to modify.

---

## API Routes

API endpoints are under `/api/v1`.

---

## Static Files

Served from `/dist/client`. Invalid routes redirect to `index.html`.

---

## MongoDB

Update `MONGO_URI` in `.env` to connect your database.

---

## License

MIT License.

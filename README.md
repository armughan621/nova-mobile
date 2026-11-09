# Nova Mobile Backend

REST API for the Nova Mobile store. The backend uses Node.js, Express, and MongoDB through Mongoose.

## Requirements

- Node.js and npm
- A MongoDB instance (local or hosted)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in this directory:

   ```env
   PORT=5000
   DB_URL=mongodb://127.0.0.1:27017/nova_mobile
   JWT_SECRET=replace_with_a_long_random_secret
   hashRounds=10
   ```

   `PORT` defaults to `3000` and `hashRounds` defaults to `10`. Use a strong, private `JWT_SECRET` and a secured MongoDB connection string in production. Do not commit `.env`.

3. Start the server:

   ```bash
   npm run dev
   ```

   For a normal start, use `npm start`. The server connects to MongoDB and prepares the default categories before accepting requests.

The API base URL is `http://localhost:5000` when using the example `PORT` above.

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the backend |
| `npm run dev` | Start with Nodemon |
| `npm test` | Run the automated tests |

## Authentication

Register and log in using the authentication endpoints below. For protected endpoints, send the returned token as a bearer token:

```http
Authorization: Bearer <token>
```

Admin-only endpoints require an authenticated account with the `admin` role. Requests to include inactive categories or products also require admin access.

## API routes

All routes are prefixed with `/api`.

### Authentication — `/auth`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | Register a user |
| `POST` | `/auth/login` | Public | Log in and receive a JWT |

### Categories — `/categories`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/categories` | Public | List active categories; admins can pass `?includeInactive=true` |
| `POST` | `/categories` | Admin | Create a category |
| `PATCH` | `/categories/:id` | Admin | Update a category |
| `DELETE` | `/categories/:id` | Admin | Archive a category |

### Products — `/products`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/products` | Public | List/filter products |
| `GET` | `/products/:id` | Public | Get a product by ID |
| `POST` | `/products` | Admin | Create a product |
| `PATCH` | `/products/:id` | Admin | Update a product |
| `DELETE` | `/products/:id` | Admin | Archive a product |

Product listing supports `category`, `search`, `brand`, `minPrice`, `maxPrice`, `minRating`, and `inStock` filters. Admins can pass `includeInactive=true` to include archived products.

### Cart — `/cart`

All cart endpoints require authentication.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/cart` | Get the current user's cart |
| `POST` | `/cart/items` | Add a product to the cart |
| `PATCH` | `/cart/items/:productId` | Set a cart item's quantity |
| `DELETE` | `/cart/items/:productId` | Remove a cart item |
| `DELETE` | `/cart` | Clear the cart |

### Orders — `/orders`

All order endpoints require authentication; admin order-management endpoints additionally require the admin role.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/orders` | User | Place an order |
| `GET` | `/orders/mine` | User | List the current user's orders |
| `GET` | `/orders/:id` | Owner or admin | Get an order |
| `PATCH` | `/orders/:id/cancel` | Owner | Cancel an eligible order |
| `GET` | `/orders` | Admin | List orders; optionally filter with `?status=pending` |
| `PATCH` | `/orders/:id/status` | Admin | Change an order's status |

Orders currently use cash on delivery and a delivery fee configured in the order route.

### Admin — `/admin`

All admin endpoints require an admin token.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/admin/users` | List users; optionally pass `?includeInactive=true` |
| `GET` | `/admin/users/:id` | Get a user |
| `PATCH` | `/admin/users/:id` | Update a user's profile or role |
| `DELETE` | `/admin/users/:id` | Archive a user |
| `GET` | `/admin/stats` | Get dashboard counts |

## Project layout

```text
backend/
├── config/       # MongoDB connection and default category setup
├── middleware/   # Authentication and authorization
├── models/       # Mongoose schemas
├── routes/       # API route handlers
├── test/         # Automated tests
├── utils/        # Shared utilities
└── server.js     # Express app and startup
```

# Bakery Management System - Full Stack Migration

This project has been migrated from HTML/CSS/JavaScript to a full-stack React.js + Node.js + MS SQL Server application.

## Project Structure

```
Restaurant Management System2/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API service layer
│   │   ├── context/       # React context (Auth)
│   │   ├── styles/        # CSS styles
│   │   └── utils/         # Helper functions
│   ├── package.json
│   └── vite.config.js
├── server/                 # Node.js backend (Express)
│   ├── config/            # Database configuration
│   ├── controllers/       # Request handlers
│   ├── routes/            # API routes
│   ├── index.js           # Server entry point
│   └── package.json
├── scripts/
│   └── db.sql             # SQL Server database schema
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v16+)
- MS SQL Server
- npm or yarn

### Backend Setup

1. Navigate to server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file in server directory:
```env
DB_SERVER=DESKTOP-9AV7L99
DB_DATABASE=BakeryManagementDB
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

**Note:** This setup uses Windows Authentication, so no DB_USER or DB_PASSWORD is needed. Make sure you're running Node.js as a user with access to SQL Server.

4. Create database and run schema:
   - Open SQL Server Management Studio
   - Create database `BakeryManagementDB`
   - Run `scripts/db.sql` to create all tables

5. Start the server:
```bash
npm start
# or for development with nodemon
npm run dev
```

Server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file in client directory:
```env
VITE_API_URL=http://localhost:5000/api
```

4. Start the development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## Features Implemented

### Backend (Node.js + Express + MS SQL Server)
- ✅ Authentication API
- ✅ Users CRUD API
- ✅ Branches CRUD API
- ✅ Items CRUD API
- ✅ Stocks Management API
- ✅ Grocery Management API (stocks, sales, returns)
- ✅ Machines Management API (batches, sales)
- ✅ Cash Management API
- ✅ Transfers API
- ✅ Reports API
- ✅ Notifications API

### Frontend (React + Vite)
- ✅ Project structure setup
- ✅ Authentication context and login page
- ✅ Layout with sidebar navigation
- ✅ API service layer (Axios)
- ✅ Dashboard page (basic structure)
- ✅ Routing setup
- ✅ CSS styles preserved

## Next Steps

The foundation is complete. To finish the migration:

1. **Complete React Pages**: Implement full functionality for each page:
   - Inventory/Master Creation
   - Add Stock
   - Internal Transfer
   - Add Return
   - Cash Management
   - Reports
   - Expire Tracking
   - Branch Management
   - User Management

2. **Replace localStorage calls**: All data operations should use the API service layer instead of localStorage.

3. **Add state management**: Consider adding React Query or Redux for better state management.

4. **Implement charts**: Add Chart.js integration for dashboard charts.

5. **Add form validation**: Implement proper form validation and error handling.

6. **Testing**: Add unit tests and integration tests.

## API Endpoints

All API endpoints are under `/api` prefix:

- `POST /api/auth/login` - User login
- `GET /api/users` - Get all users
- `POST /api/users` - Create user
- `GET /api/branches` - Get all branches
- `POST /api/branches` - Create branch
- `GET /api/items` - Get all items
- `POST /api/items` - Create item
- `GET /api/stocks` - Get stocks
- `POST /api/stocks/update` - Update stocks
- And more... (see server/routes for full list)

## Default Login Credentials

- Admin: `admin` / `admin`
- Operator: `operator` / `operator`

## Notes

- The database schema includes all necessary tables for the complete system
- All original JavaScript functions have been analyzed and converted to API endpoints
- The CSS styling has been preserved from the original design
- The frontend uses React Router for navigation
- Authentication is managed through React Context API


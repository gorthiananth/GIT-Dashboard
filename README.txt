# Create project directories
mkdir -p CloudpulseGitUI/backend CloudpulseGitUI/frontend

# Backend setup
cd CloudpulseGitUI/backend
npm init -y
npm install express cors

# Start backend
node index.js

# Frontend setup
cd ../frontend
npx create-react-app .
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material

# Start frontend
npm start


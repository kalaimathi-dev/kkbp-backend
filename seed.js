const mongoose = require("mongoose");
const { connectDB } = require("./config/database");
const { User, Category, Article, Tag } = require("./models");

const seedDatabase = async () => {
  try {
    console.log("🌱 Seeding database (MongoDB)...");
    await connectDB();

    await mongoose.connection.dropDatabase();
    console.log("✅ Database dropped");

    await User.create({
      username: "admin",
      email: "admin@kambaa.in",
      password: "admin123",
      role: "ADMIN",
    });
    console.log("✅ Admin user created");

    await User.create([
      {
        username: "john_doe",
        email: "john.doe@kambaa.in",
        password: "employee123",
        role: "EMPLOYEE",
      },
      {
        username: "jane_smith",
        email: "jane.smith@kambaa.in",
        password: "employee123",
        role: "EMPLOYEE",
      },
    ]);
    console.log("✅ Employee users created");

    await Category.create([
      { name: "Technology", description: "Tech-related articles" },
      { name: "Development", description: "Software development" },
      { name: "Design", description: "UI/UX and design" },
      { name: "Best Practices", description: "Industry best practices" },
      { name: "Tutorials", description: "Step-by-step guides" },
      { name: "Documentation", description: "Project documentation" },
    ]);
    console.log("✅ Categories created");

    // Get created data
    const admin = await User.findOne({ email: "admin@kambaa.in" });
    const employee = await User.findOne({ email: "john.doe@kambaa.in" });
    const techCategory = await Category.findOne({ name: "Technology" });
    const devCategory = await Category.findOne({ name: "Development" });
    const tutorialCategory = await Category.findOne({ name: "Tutorials" });

    // Create Tags
    const tags = await Tag.create([
      { name: "API" },
      { name: "Database" },
      { name: "Error" },
      { name: "Fix" },
      { name: "MongoDB" },
      { name: "Node.js" },
      { name: "React" },
      { name: "Performance" },
      { name: "Security" },
      { name: "Nginx" },
    ]);
    console.log("✅ Tags created");

    // Create sample approved articles
    const articles = await Article.create([
      {
        title: "How to Fix API Timeout Issues in Node.js",
        content: `# Solution

API timeouts often occur due to long-running database queries or external API calls. Here's how to fix them:

## Step 1: Increase Timeout Duration
\`\`\`javascript
app.use(timeout('30s'));
\`\`\`

## Step 2: Add Request Timeout Handler
\`\`\`javascript
app.use((req, res, next) => {
  if (!req.timedout) next();
});
\`\`\`

## Step 3: Optimize Database Queries
- Add proper indexes
- Use query projection to limit fields
- Implement pagination for large datasets

## Step 4: Use Async/Await Properly
Make sure all promises are properly awaited to avoid blocking.

**Result:** API response times reduced from 30s to 2s.`,
        excerpt: "Learn how to diagnose and fix API timeout issues in Node.js applications by optimizing queries and configuring proper timeout handlers.",
        status: "APPROVED",
        author: employee._id,
        category: techCategory._id,
        tags: [tags[0]._id, tags[5]._id, tags[3]._id],
        approvedBy: admin._id,
        approvedAt: new Date(),
        views: 45,
      },
      {
        title: "MongoDB Connection Refused Error - Complete Fix",
        content: `# MongoDB Connection Refused Error

This error occurs when MongoDB service is not running or connection string is incorrect.

## Quick Fix:

### Windows:
\`\`\`powershell
# Check MongoDB service status
Get-Service MongoDB

# Start MongoDB service
Start-Service MongoDB
\`\`\`

### Linux/Mac:
\`\`\`bash
sudo systemctl start mongod
\`\`\`

## Verify Connection String:
\`\`\`
mongodb://127.0.0.1:27017/your_database
\`\`\`

## Common Issues:
1. **Port already in use** - Check if another process is using port 27017
2. **Firewall blocking** - Allow MongoDB through firewall
3. **Wrong URI** - Verify connection string format
4. **MongoDB not installed** - Install MongoDB Community Server

## Test Connection:
\`\`\`bash
mongosh
\`\`\`

If successful, you should see the MongoDB shell prompt.`,
        excerpt: "Step-by-step guide to resolve MongoDB connection refused errors on Windows, Linux, and Mac systems.",
        status: "APPROVED",
        author: employee._id,
        category: devCategory._id,
        tags: [tags[1]._id, tags[2]._id, tags[4]._id, tags[3]._id],
        approvedBy: admin._id,
        approvedAt: new Date(),
        views: 78,
      },
      {
        title: "Nginx 502 Bad Gateway - Troubleshooting Guide",
        content: `# Fixing Nginx 502 Bad Gateway Error

A 502 error means Nginx cannot connect to your backend application.

## Solution Steps:

### 1. Check if Backend is Running
\`\`\`bash
# Check if Node.js app is running
pm2 list

# Or check port
netstat -tulpn | grep :3000
\`\`\`

### 2. Verify Nginx Configuration
\`\`\`nginx
upstream backend {
    server 127.0.0.1:3000;
}

server {
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
\`\`\`

### 3. Check Nginx Error Logs
\`\`\`bash
tail -f /var/log/nginx/error.log
\`\`\`

### 4. Increase Timeout Values
\`\`\`nginx
proxy_connect_timeout 600;
proxy_send_timeout 600;
proxy_read_timeout 600;
\`\`\`

### 5. Restart Services
\`\`\`bash
sudo systemctl restart nginx
pm2 restart app
\`\`\`

**Common Causes:**
- Backend application crashed
- Wrong port in proxy_pass
- SELinux blocking connections
- Backend taking too long to respond`,
        excerpt: "Complete guide to diagnose and fix Nginx 502 Bad Gateway errors with backend applications.",
        status: "APPROVED",
        author: employee._id,
        category: tutorialCategory._id,
        tags: [tags[2]._id, tags[3]._id, tags[9]._id],
        approvedBy: admin._id,
        approvedAt: new Date(),
        views: 92,
      },
      {
        title: "React Component Not Rendering - Debug Guide",
        content: `# React Component Not Rendering

Common reasons and solutions for React components not displaying.

## Common Issues:

### 1. Incorrect Import/Export
\`\`\`javascript
// Wrong
export default MyComponent;
import { MyComponent } from './MyComponent';

// Correct
export default MyComponent;
import MyComponent from './MyComponent';
\`\`\`

### 2. Missing Return Statement
\`\`\`javascript
// Wrong
const MyComponent = () => {
  <div>Content</div>
}

// Correct
const MyComponent = () => {
  return <div>Content</div>
}
\`\`\`

### 3. Conditional Rendering Issue
Make sure conditions are properly evaluated:
\`\`\`javascript
{data && data.length > 0 && (
  <Component data={data} />
)}
\`\`\`

### 4. Check React DevTools
Open React DevTools to see if component is in the tree.

### 5. CSS Display Issue
Component might be rendered but hidden:
\`\`\`css
/* Check for */
display: none;
opacity: 0;
visibility: hidden;
\`\`\`

### 6. Key Prop in Lists
Always provide unique keys:
\`\`\`javascript
{items.map(item => (
  <Component key={item.id} data={item} />
))}
\`\`\`

**Debug Steps:**
1. Check browser console for errors
2. Verify component is imported correctly
3. Add console.log to check if component is called
4. Inspect element to see if HTML exists`,
        excerpt: "Debug guide for React components that won't render, covering common issues and solutions.",
        status: "APPROVED",
        author: employee._id,
        category: devCategory._id,
        tags: [tags[6]._id, tags[2]._id, tags[3]._id],
        approvedBy: admin._id,
        approvedAt: new Date(),
        views: 63,
      },
      {
        title: "MongoDB Authentication Failed - Security Fix",
        content: `# MongoDB Authentication Failed

How to properly configure MongoDB authentication and resolve auth errors.

## Solution:

### 1. Create Admin User
\`\`\`javascript
use admin
db.createUser({
  user: "admin",
  pwd: "securePassword123",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})
\`\`\`

### 2. Enable Authentication
Edit \`/etc/mongod.conf\`:
\`\`\`yaml
security:
  authorization: "enabled"
\`\`\`

### 3. Create Database User
\`\`\`javascript
use myDatabase
db.createUser({
  user: "appUser",
  pwd: "appPassword123",
  roles: [ { role: "readWrite", db: "myDatabase" } ]
})
\`\`\`

### 4. Update Connection String
\`\`\`
mongodb://appUser:appPassword123@localhost:27017/myDatabase?authSource=myDatabase
\`\`\`

### 5. Common Errors:

**Error: Authentication failed**
- Wrong username or password
- User doesn't exist in the specified database
- Wrong authSource in connection string

**Error: not authorized**
- User doesn't have required permissions
- Need to grant additional roles

### 6. Grant Roles
\`\`\`javascript
db.grantRolesToUser("appUser", [
  { role: "readWrite", db: "myDatabase" }
])
\`\`\`

**Security Best Practices:**
- Use strong passwords
- Create separate users for each application
- Grant minimum required permissions
- Regularly rotate credentials
- Use SSL/TLS for connections`,
        excerpt: "Complete guide to setting up MongoDB authentication and fixing authentication errors.",
        status: "APPROVED",
        author: employee._id,
        category: techCategory._id,
        tags: [tags[4]._id, tags[8]._id, tags[3]._id],
        approvedBy: admin._id,
        approvedAt: new Date(),
        views: 55,
      },
    ]);
    console.log("✅ Sample articles created");

    console.log("\n🎉 Database seeded successfully!\n");
    console.log("📝 Test Credentials:");
    console.log("Admin:");
    console.log("  Email: admin@kambaa.in");
    console.log("  Password: admin123");
    console.log("\nEmployee:");
    console.log("  Email: john.doe@kambaa.in");
    console.log("  Password: employee123");
    console.log("\n📊 Data Created:");
    console.log("  - 2 Users (1 Admin, 2 Employees)");
    console.log("  - 6 Categories");
    console.log("  - 10 Tags");
    console.log("  - 5 Approved Articles (ready for chatbot)");
    console.log("\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  }
};

seedDatabase();

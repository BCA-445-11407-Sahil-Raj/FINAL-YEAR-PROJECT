const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DB_FILE = './data.json';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Data Structure
let db = {
    users: [],
    courses: [],
    students: [],
    results: []
};

// Load data from file if exists
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (err) {
        console.error("Error reading DB file, starting fresh.");
    }
} else {
    // Create Default Admin if file doesn't exist
    db.users.push({
        name: 'Admin User',
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        securityQuestions: [
            { question: 'Favorite animal?', answer: 'tiger' },
            { question: 'Favorite place?', answer: 'paris' }
        ]
    });
    saveData();
}

function saveData() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ================= ROUTES =================

// --- Auth ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, user: { name: user.name, username: user.username, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/register', (req, res) => {
    const userData = req.body;
    if (db.users.find(u => u.username === userData.username)) {
        return res.json({ success: false, message: 'Username exists' });
    }
    db.users.push(userData);
    saveData();
    res.json({ success: true });
});

app.post('/api/user/details', (req, res) => {
    const { username } = req.body;
    const user = db.users.find(u => u.username === username);
    if(user) res.json(user);
    else res.status(404).json({message: "User not found"});
});

app.post('/api/user/update-password', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username);
    if (user) {
        user.password = password;
        saveData();
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// --- Courses ---
app.get('/api/courses', (req, res) => res.json(db.courses));

app.post('/api/courses', (req, res) => {
    const course = { ...req.body, id: Date.now().toString() };
    db.courses.push(course);
    saveData();
    res.json(course);
});

app.delete('/api/courses/:id', (req, res) => {
    db.courses = db.courses.filter(c => c.id !== req.params.id);
    db.results = db.results.filter(r => r.courseId !== req.params.id);
    saveData();
    res.json({ success: true });
});

// --- Students (UPDATED FOR MAJOR PROJECT) ---
app.get('/api/students', (req, res) => res.json(db.students));

app.post('/api/students', (req, res) => {
    // New fields: mobile, dob, address, collegeCode, studentId, gender
    const student = { 
        ...req.body, 
        id: Date.now().toString(), 
        registrationDate: new Date().toISOString() 
    };
    db.students.push(student);
    saveData();
    res.json(student);
});

app.delete('/api/students/:id', (req, res) => {
    db.students = db.students.filter(s => s.id !== req.params.id);
    db.results = db.results.filter(r => r.studentId !== req.params.id);
    saveData();
    res.json({ success: true });
});

app.get('/api/students/roll/:roll', (req, res) => {
    const student = db.students.find(s => s.rollNumber === req.params.roll);
    if(student) res.json(student);
    else res.status(404).json(null);
});

// --- Results & Analysis ---
app.get('/api/results/student/:rollNumber', (req, res) => {
    const student = db.students.find(s => s.rollNumber === req.params.rollNumber);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const studentResults = db.results
        .filter(r => r.studentId === student.id)
        .map(r => {
            const course = db.courses.find(c => c.id === r.courseId);
            return {
                ...r,
                courseName: course ? course.name : 'Unknown',
                courseCode: course ? course.code : 'N/A'
            };
        });

    // --- MAJOR PROJECT LOGIC: Prediction & Growth ---
    const totalMarks = studentResults.reduce((sum, r) => sum + Number(r.marks), 0);
    const avg = studentResults.length ? (totalMarks / studentResults.length) : 0;
    
    let prediction = "Stable";
    let statusColor = "blue";

    if (avg >= 85) { 
        prediction = "Outstanding - Likely to Top the Board"; 
        statusColor = "green";
    } else if (avg >= 70) { 
        prediction = "Good - Consistent Growth Observed"; 
        statusColor = "blue";
    } else if (avg >= 50) { 
        prediction = "Average - Needs Focus on Weak Subjects"; 
        statusColor = "yellow";
    } else { 
        prediction = "At Risk - Immediate Intervention Required"; 
        statusColor = "red";
    }

    res.json({ 
        student, 
        results: studentResults, 
        stats: { avg, prediction, statusColor }
    });
});

app.post('/api/results', (req, res) => {
    const result = { ...req.body, id: Date.now().toString(), date: new Date().toISOString() };
    db.results.push(result);
    saveData();
    res.json(result);
});

// --- Stats & Leaderboard ---
app.get('/api/stats', (req, res) => {
    // 1. Calculate Leaderboard (Top 5 Students by Average)
    const leaderboard = db.students.map(s => {
        const sResults = db.results.filter(r => r.studentId === s.id);
        const total = sResults.reduce((sum, r) => sum + Number(r.marks), 0);
        const avg = sResults.length ? (total / sResults.length).toFixed(1) : 0;
        
        // Find Course Name (BCA/BBA)
        const courseObj = db.courses.find(c => c.id === s.courseId);
        
        return {
            name: s.name,
            roll: s.rollNumber,
            course: courseObj ? courseObj.name : 'N/A',
            avg: Number(avg)
        };
    })
    .sort((a, b) => b.avg - a.avg) // Sort descending
    .slice(0, 5); // Take top 5

    res.json({
        totalStudents: db.students.length,
        totalCourses: db.courses.length,
        totalResults: db.results.length,
        leaderboard: leaderboard
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
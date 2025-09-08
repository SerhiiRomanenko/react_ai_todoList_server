import express from 'express';
import cors from 'cors';
import {GoogleGenAI, Type} from '@google/genai';
import {randomUUID} from 'crypto';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

// --- Constants ---
const Category = {
    Work: 'Work',
    Personal: 'Personal',
    Learning: 'Learning',
    Shopping: 'Shopping',
    Health: 'Health',
    Home: 'Home',
    Other: 'Other',
};

const Priority = {
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
};

// --- In-Memory Database ---
let tasks = [];

// --- Gemini Service (Internal Helper) ---
const analyzeTaskWithAI = async (taskText) => {
    if (!process.env.API_KEY) {
        console.warn("Warning: API_KEY environment variable not set. AI features will be disabled. Using default values for new tasks.");
        return {category: Category.Other, priority: Priority.Medium};
    }
    const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            category: {type: Type.STRING, enum: Object.values(Category)},
            priority: {type: Type.STRING, enum: Object.values(Priority)},
        },
        required: ['category', 'priority'],
    };

    try {
        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Analyze the following task and assign a category and priority. Task: "${taskText}"`,
            config: {
                systemInstruction: `You are an intelligent task analyzer. Your job is to determine a task's category and priority. Categories are: ${Object.values(Category).join(', ')}. Priorities are: ${Object.values(Priority).join(', ')}. Respond ONLY with a valid JSON object matching the provided schema.`,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            }
        });

        const jsonString = result.text?.trim();

        if (!jsonString) {
            console.warn("AI analysis returned an empty response. Using fallback values.");
            return {category: Category.Other, priority: Priority.Medium};
        }

        const parsed = JSON.parse(jsonString);

        return {
            category: parsed.category || Category.Other,
            priority: parsed.priority || Priority.Medium,
        };
    } catch (error) {
        console.error("AI analysis failed on server:", error);
        // Fallback in case of AI failure
        return {category: Category.Other, priority: Priority.Medium};
    }
};

// --- Server Setup ---
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- API Endpoints ---

// GET /api/tasks - Retrieve all tasks
app.get('/api/tasks', (req, res) => {
    const sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
    res.json(sortedTasks);
});

// POST /api/tasks - Create a new task
app.post('/api/tasks', async (req, res) => {
    const {taskText} = req.body;
    if (!taskText || typeof taskText !== 'string' || !taskText.trim()) {
        return res.status(400).json({error: 'taskText is required and must be a non-empty string'});
    }

    try {
        const analysis = await analyzeTaskWithAI(taskText.trim());
        const newTask = {
            id: randomUUID(),
            text: taskText.trim(),
            completed: false,
            createdAt: Date.now(),
            category: analysis.category,
            priority: analysis.priority,
        };
        tasks.push(newTask);
        res.status(201).json(newTask);
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({error: 'Failed to create task on the server.'});
    }
});

// PUT /api/tasks/:id - Update a task (specifically for completion status)
app.put('/api/tasks/:id', (req, res) => {
    const {id} = req.params;
    const {completed} = req.body;

    if (typeof completed !== 'boolean') {
        return res.status(400).json({error: 'A boolean `completed` status is required.'});
    }

    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
        return res.status(404).json({error: 'Task not found'});
    }

    tasks[taskIndex].completed = completed;
    res.json(tasks[taskIndex]);
});

// DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', (req, res) => {
    const {id} = req.params;
    const initialLength = tasks.length;
    tasks = tasks.filter(t => t.id !== id);

    if (tasks.length === initialLength) {
        return res.status(404).json({error: 'Task not found'});
    }
    res.status(204).send(); // No Content on successful deletion
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

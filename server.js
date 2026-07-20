import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { authMiddleware } from './middleware.js';
import { registerUser, loginUser } from './auth.js';

dotenv.config();

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

let tasks = [];

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const analyzeTaskWithAI = async (taskText) => {
    if (!process.env.GROQ_API_KEY) {
        console.warn("Warning: GROQ_API_KEY not set. Using default values.");
        return { category: Category.Other, priority: Priority.Medium };
    }

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a task analyzer. Determine category and priority.
Categories: ${Object.values(Category).join(', ')}.
Priorities: ${Object.values(Priority).join(', ')}.
Respond with ONLY a JSON object: {"category": "...", "priority": "..."}.\n`,
                },
                { role: 'user', content: `Task: "${taskText}"` },
            ],
            response_format: { type: 'json_object' },
            temperature: 0,
            max_tokens: 100,
        });

        const jsonString = response.choices[0].message.content?.trim();
        if (!jsonString) throw new Error('Empty response');

        const parsed = JSON.parse(jsonString);
        return {
            category: parsed.category || Category.Other,
            priority: parsed.priority || Priority.Medium,
        };
    } catch (error) {
        console.error("AI analysis failed:", error.message);
        return { category: Category.Other, priority: Priority.Medium };
    }
};

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await registerUser(email, password);
        res.status(201).json({ user });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await loginUser(email, password);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

app.get('/api/tasks', authMiddleware, (req, res) => {
    const userTasks = tasks.filter(t => t.userId === req.userId);
    const sortedTasks = userTasks.sort((a, b) => b.createdAt - a.createdAt);
    res.json(sortedTasks);
});

app.post('/api/tasks', authMiddleware, async (req, res) => {
    const { taskText } = req.body;
    if (!taskText || typeof taskText !== 'string' || !taskText.trim()) {
        return res.status(400).json({ error: 'taskText is required and must be a non-empty string' });
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
            userId: req.userId,
        };
        tasks.push(newTask);
        res.status(201).json(newTask);
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ error: 'Failed to create task on the server.' });
    }
});

app.put('/api/tasks/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;

    if (typeof completed !== 'boolean') {
        return res.status(400).json({ error: 'A boolean `completed` status is required.' });
    }

    const task = tasks.find(t => t.id === id && t.userId === req.userId);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    task.completed = completed;
    res.json(task);
});

app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const initialLength = tasks.length;
    tasks = tasks.filter(t => !(t.id === id && t.userId === req.userId));

    if (tasks.length === initialLength) {
        return res.status(404).json({ error: 'Task not found' });
    }
    res.status(204).send();
});

app.post('/api/chat', authMiddleware, async (req, res) => {
    const { message, locale } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }

    const userTasks = tasks.filter(t => t.userId === req.userId);
    const tasksContext = userTasks.length > 0
        ? userTasks.map((t, i) => `${i + 1}. ${t.text} (${t.priority}, ${t.category})${t.completed ? ' — DONE' : ''}`).join('\n')
        : '(no tasks yet)';

    const language = locale === 'uk' ? 'Ukrainian' : 'English';
    const systemPrompt = `You are a helpful AI assistant for a todo list app. The user's current tasks are:

${tasksContext}

Answer the user's questions in ${language}. Be helpful, concise, and reference their actual tasks when giving advice. Use numbered lists when suggesting priorities. If the user asks about their tasks, base your answer on the list above.`;

    if (!process.env.GROQ_API_KEY) {
        const offlineMsg = locale === 'uk'
            ? `Ви написали: "${message.trim()}". (AI-помічник вимкнено — GROQ_API_KEY не встановлено)`
            : `You said: "${message.trim()}". (AI assistant is offline — GROQ_API_KEY not set)`;
        return res.json({ reply: offlineMsg });
    }

    try {
        const chatResponse = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message.trim() },
            ],
            temperature: 0.7,
            max_tokens: 500,
        });

        const reply = chatResponse.choices[0].message.content?.trim();
        if (!reply) throw new Error('Empty response');
        res.json({ reply });
    } catch (error) {
        console.error('Chat AI failed:', error.message);
        res.status(500).json({ error: 'AI chat failed. Try again later.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

const express = require('express');
const cors = require('cors');
const { setupDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 4310;

app.use(cors());
app.use(express.json());

let db;

// Initialize db and start server
async function startServer() {
    try {
        db = await setupDatabase();
        console.log('Database initialized successfully.');

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
    }
}

// Routes
// POST a new booking
app.post('/api/bookings', async (req, res) => {
    try {
        const { firstName, lastName, phone, email, year, make, model, concern } = req.body;

        // Basic validation
        if (!firstName || !lastName || !phone || !email || !year || !make || !model || !concern) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const result = await db.run(
            `INSERT INTO bookings (firstName, lastName, phone, email, year, make, model, concern, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [firstName, lastName, phone, email, year, make, model, concern]
        );

        res.status(201).json({ id: result.lastID, message: 'Booking created successfully.' });
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Failed to create booking.' });
    }
});

// GET all bookings (Admin)
app.get('/api/bookings', async (req, res) => {
    try {
        const bookings = await db.all('SELECT * FROM bookings ORDER BY created_at DESC');
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings.' });
    }
});

// PUT update booking status (Admin)
app.put('/api/bookings/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'accepted', 'rejected', 'archived', 'deleted'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        if (status === 'deleted') {
            const result = await db.run('DELETE FROM bookings WHERE id = ?', [id]);
            if (result.changes === 0) return res.status(404).json({ error: 'Booking not found.' });
            return res.json({ message: 'Booking deleted successfully.' });
        }

        const result = await db.run('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Booking not found.' });
        }

        res.json({ message: 'Booking status updated successfully.' });
    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ error: 'Failed to update booking status.' });
    }
});

startServer();

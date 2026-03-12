const { setupDatabase } = require('./db');

const fakeBookings = [
    {
        firstName: 'John',
        lastName: 'Doe',
        phone: '1234567890',
        email: 'john.doe@example.com',
        year: '2015',
        make: 'Toyota',
        model: 'Camry',
        concern: 'Brakes are squeaking when I stop.',
        status: 'pending'
    },
    {
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '9876543210',
        email: 'jane.smith@example.com',
        year: '2020',
        make: 'Honda',
        model: 'Civic',
        concern: 'Oil light came on yesterday.',
        status: 'pending'
    },
    {
        firstName: 'Bob',
        lastName: 'Johnson',
        phone: '5551234567',
        email: 'bob.j@example.com',
        year: '2018',
        make: 'Ford',
        model: 'Mustang',
        concern: 'Engine is making a loud knocking noise.',
        status: 'accepted'
    },
    {
        firstName: 'Alice',
        lastName: 'Williams',
        phone: '4449876543',
        email: 'alice.w@example.com',
        year: '2022',
        make: 'Tesla',
        model: 'Model 3',
        concern: 'Needs regular maintenance checkup.',
        status: 'pending'
    },
    {
        firstName: 'Charlie',
        lastName: 'Brown',
        phone: '3335557777',
        email: 'cbrown@example.com',
        year: '2010',
        make: 'Chevrolet',
        model: 'Silverado',
        concern: 'AC is not blowing cold air.',
        status: 'archived'
    }
];

async function seed() {
    try {
        const db = await setupDatabase();
        console.log('Database connected.');

        for (const booking of fakeBookings) {
            await db.run(
                `INSERT INTO bookings (firstName, lastName, phone, email, year, make, model, concern, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    booking.firstName, 
                    booking.lastName, 
                    booking.phone, 
                    booking.email, 
                    booking.year, 
                    booking.make, 
                    booking.model, 
                    booking.concern, 
                    booking.status
                ]
            );
        }
        console.log('Successfully inserted fake bookings.');
    } catch (error) {
        console.error('Error seeding database:', error);
    }
}

seed();

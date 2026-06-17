const express = require('express');
const app = express();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const dbConfig = {
    host: 'localhost',
    user: 'ricosoftusa_september_user',
    password: 'yUhU5(d^F]?&FVEB',
    database: 'ricosoftusa_backup_september',
    waitForConnections: true,
    connectionLimit: 100000,
    queueLimit: 0,
};
//21 date
const pool = mysql.createPool(dbConfig);
const conn = mysql.createConnection({
    host: 'your_host',//localhost
    user: 'database_username',
    password: 'yourdatabase_password',
    database: 'your_database'
});


// 1st api to get User data

// GET API: /game/userInfo
app.get("/wave/game/userInfo", async (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: 'Authorization token is required.',
        });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.sub) {
        return res.status(233).json({
            success: false,
            message: 'Invalid or missing user information in the token.'
        });
    }
    let conn;
    const userId = decoded.sub;
    conn = await mysql.createConnection(dbConfig);
    const [users] = await conn.execute('SELECT id as id, beans as balance,nick_name as name,image as profilePicture FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = users[0];
    // SUCCESS RESPONSE
    return res.status(200).json({
        success: true,
        message: "User info fetched successfully",
        data: user
    });
});


// 2nd api to placebet and add balance

///place bet wavegames
app.post("/wave/game/submitFlow", async (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: 'Authorization token is required.',
        });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.sub) {
        return res.status(233).json({
            success: false,
            message: 'Invalid or missing user information in the token.'
        });
    }
    let conn;
    const userId = decoded.sub;
    conn = await mysql.createConnection(dbConfig);
    const [users] = await conn.execute('SELECT id as id, beans as balance,nick_name as name,image as profilePicture FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
        return res.status(422).json({ success: false, message: 'User not found' });
    }
    const user = users[0];
    const data = req.body;
    if (!data) {
        return res.status(422).json({ success: false, message: `Invalid data ${data}` });
    }
    let betAmount = data.betAmount;
    if (!data.betAmount) {
        return res.status(422).json({ success: false, message: 'Please Provide betAmount.' });
    }
    let type = data.type;
    if (!data.type) {
        return res.status(422).json({ success: false, message: 'Please Provide type.' });
    }


    if (type == 1) {
        await conn.execute('UPDATE users SET beans = beans - ? WHERE id = ?', [betAmount, userId]);
    } else if (type == 2) {
        await conn.execute('UPDATE users SET beans = beans + ? WHERE id = ?', [betAmount, userId]);
    }
    const [updateduserdata] = await conn.execute('SELECT id as id, beans as balance,nick_name as name,image as profilePicture FROM users WHERE id = ?', [userId]);
    const userdata = updateduserdata[0];
    return res.status(200).json({
        success: true,
        message: "success",
        data: userdata
    });
});

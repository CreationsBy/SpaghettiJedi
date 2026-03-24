// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const DATA_FILE = './fridge-data.json';
let fridgeItems = {};

if (fs.existsSync(DATA_FILE)) {
    const rawData = fs.readFileSync(DATA_FILE);
    fridgeItems = JSON.parse(rawData);
    console.log('Loaded previous fridge state.');
}

function saveFridgeState() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(fridgeItems, null, 2));
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.emit('initFridge', fridgeItems);

    socket.on('newItem', (itemData) => {
        fridgeItems[itemData.id] = itemData;
        saveFridgeState(); 
        socket.broadcast.emit('itemAdded', itemData);
    });

    socket.on('moveItem', (data) => {
        if (fridgeItems[data.id] && fridgeItems[data.id].owner === data.ownerId) {
            fridgeItems[data.id].x = data.x;
            fridgeItems[data.id].y = data.y;
            saveFridgeState(); 
            socket.broadcast.emit('itemMoved', data);
        }
    });

    socket.on('updateDrawing', (data) => {
        if (fridgeItems[data.id] && fridgeItems[data.id].owner === data.ownerId) {
            fridgeItems[data.id].canvasData = data.canvasData;
            saveFridgeState(); 
            socket.broadcast.emit('drawingUpdated', data);
        }
    });

    socket.on('updateText', (data) => {
        if (fridgeItems[data.id] && fridgeItems[data.id].owner === data.ownerId) {
            fridgeItems[data.id].text = data.text; 
            saveFridgeState(); 
            socket.broadcast.emit('textUpdated', data); 
        }
    });

    socket.on('updateMode', (data) => {
        if (fridgeItems[data.id] && fridgeItems[data.id].owner === data.ownerId) {
            fridgeItems[data.id].isDrawingMode = data.isDrawingMode;
            saveFridgeState(); 
            socket.broadcast.emit('modeUpdated', data); 
        }
    });

    // --- NEW FEATURE: Update Username across all items ---
    socket.on('updateUsername', (data) => {
        let changed = false;
        for (let id in fridgeItems) {
            if (fridgeItems[id].owner === data.ownerId) {
                fridgeItems[id].username = data.newUsername;
                changed = true;
            }
        }
        if (changed) {
            saveFridgeState();
            // Tell everyone to update this user's labels!
            io.emit('usernameUpdated', data);
        }
    });

    socket.on('deleteItem', (data) => {
        if (fridgeItems[data.id] && fridgeItems[data.id].owner === data.ownerId) {
            delete fridgeItems[data.id];
            saveFridgeState(); 
            io.emit('itemDeleted', data.id);
        }
    });

    socket.on('clearMyItems', (ownerId) => {
        const idsToDelete = [];
        for (let id in fridgeItems) {
            if (fridgeItems[id].owner === ownerId) {
                idsToDelete.push(id);
                delete fridgeItems[id];
            }
        }
        
        if (idsToDelete.length > 0) {
            saveFridgeState();
            io.emit('itemsDeleted', idsToDelete); 
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Fridge server running on http://localhost:${PORT}`);
});
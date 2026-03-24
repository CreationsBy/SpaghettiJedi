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

let activeUsers = {};

if (fs.existsSync(DATA_FILE)) {
    const rawData = fs.readFileSync(DATA_FILE);
    fridgeItems = JSON.parse(rawData);
    console.log('Loaded previous fridge state.');
}

function saveFridgeState() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(fridgeItems, null, 2));
}

function getUniqueUsername(baseName, ownerId) {
    let nameToTry = baseName;
    let counter = 1;
    
    while (true) {
        let isTaken = false;
        for (let id in activeUsers) {
            if (id !== ownerId && activeUsers[id] === nameToTry) {
                isTaken = true;
                break;
            }
        }
        
        if (!isTaken) return nameToTry; 
        
        nameToTry = `${baseName} (${counter})`;
        counter++;
    }
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.emit('initFridge', fridgeItems);

    socket.on('registerUser', (data) => {
        let uniqueName = getUniqueUsername(data.username, data.ownerId);
        activeUsers[data.ownerId] = uniqueName; 
        
        socket.emit('usernameConfirmed', uniqueName); 
        
        let changed = false;
        for (let id in fridgeItems) {
            if (fridgeItems[id].owner === data.ownerId && fridgeItems[id].username !== uniqueName) {
                fridgeItems[id].username = uniqueName;
                changed = true;
            }
        }
        if (changed) {
            saveFridgeState();
            io.emit('usernameUpdated', { ownerId: data.ownerId, newUsername: uniqueName });
        }
    });

    // --- NEW FEATURE: Allow browsers to restore forgotten items if the server wiped! ---
    socket.on('restoreMyItems', (data) => {
        if (!data.items) return;
        
        let changed = false;
        for (let id in data.items) {
            // If the server lost it (from a restart) AND it genuinely belongs to the restorer
            if (!fridgeItems[id] && data.items[id].owner === data.ownerId) {
                fridgeItems[id] = data.items[id];
                changed = true;
                // Tell EVERYONE (including the restorer) to draw this recovered item
                io.emit('itemAdded', data.items[id]); 
            }
        }
        
        if (changed) {
            saveFridgeState();
            console.log(`Restored missing items from user ${data.ownerId}'s local backup!`);
        }
    });

    socket.on('updateUsername', (data) => {
        let uniqueName = getUniqueUsername(data.newUsername, data.ownerId);
        activeUsers[data.ownerId] = uniqueName; 
        
        socket.emit('usernameConfirmed', uniqueName); 

        let changed = false;
        for (let id in fridgeItems) {
            if (fridgeItems[id].owner === data.ownerId) {
                fridgeItems[id].username = uniqueName;
                changed = true;
            }
        }
        if (changed) {
            saveFridgeState();
            io.emit('usernameUpdated', { ownerId: data.ownerId, newUsername: uniqueName });
        }
    });

    socket.on('newItem', (itemData) => {
        if (!activeUsers[itemData.owner]) {
            activeUsers[itemData.owner] = getUniqueUsername(itemData.username, itemData.owner);
        }
        itemData.username = activeUsers[itemData.owner]; 
        
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
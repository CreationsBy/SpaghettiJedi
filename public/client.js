const socket = io();

const instructionsModal = document.getElementById('instructions-modal');
const closeInstructionsBtn = document.getElementById('close-instructions-btn');
const showInstructionsBtn = document.getElementById('show-instructions-btn');

showInstructionsBtn.addEventListener('click', () => {
    instructionsModal.classList.remove('hidden');
});

closeInstructionsBtn.addEventListener('click', () => {
    instructionsModal.classList.add('hidden');
});

if (!localStorage.getItem('hasSeenFridgeInstructions')) {
    instructionsModal.classList.remove('hidden');
    localStorage.setItem('hasSeenFridgeInstructions', 'true');
}

let myId = localStorage.getItem('fridgeUserId');
if (!myId) {
    myId = 'user-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    localStorage.setItem('fridgeUserId', myId);
}

const fridgeArea = document.getElementById('fridge-area');
const fridgeSurface = document.getElementById('fridge-surface'); 
const sfxPlace = document.getElementById('sfx-place');
const sfxDelete = document.getElementById('sfx-delete');

let currentUsername = localStorage.getItem('fridgeUsername') || "Anonymous";
const usernameInput = document.getElementById('username-input');
usernameInput.value = currentUsername;

let typingTimer; 

usernameInput.addEventListener('input', (e) => {
    const typedName = e.target.value.trim() || "Anonymous";
    
    clearTimeout(typingTimer);
    
    typingTimer = setTimeout(() => {
        socket.emit('updateUsername', { ownerId: myId, newUsername: typedName });
    }, 500); 
});

document.getElementById('clear-my-items-btn').addEventListener('click', () => {
    socket.emit('clearMyItems', myId); 
});

let clientItems = {}; 

// --- NEW FEATURE: Continuously auto-save items to local storage ---
setInterval(() => {
    const myItems = {};
    for (let id in clientItems) {
        if (clientItems[id].owner === myId) {
            myItems[id] = clientItems[id];
        }
    }
    // Convert to string and save, so your browser remembers your art
    localStorage.setItem('fridgeBackup', JSON.stringify(myItems));
}, 2000);

const miniMap = document.getElementById('mini-map');
const mapCtx = miniMap.getContext('2d');
const SURFACE_SIZE = 10000;
const MAP_SIZE = 200;
const scale = MAP_SIZE / SURFACE_SIZE; 

const labelContainer = document.getElementById('label-container');
let activeLabels = []; 

function updateGameLoop() {
    mapCtx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    const items = fridgeSurface.children;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.classList.contains('magnet') || item.classList.contains('sticky-note')) {
            const isMagnet = item.classList.contains('magnet');
            const x = parseFloat(item.style.left) * scale;
            const y = parseFloat(item.style.top) * scale;
            const w = Math.max((isMagnet ? 40 : 200) * scale, 3); 
            const h = Math.max((isMagnet ? 40 : 220) * scale, 3);

            mapCtx.fillStyle = isMagnet ? '#d4c32b' : '#e6c84c'; 
            mapCtx.fillRect(x, y, w, h);
        }
    }

    const viewX = fridgeArea.scrollLeft * scale;
    const viewY = fridgeArea.scrollTop * scale;
    const viewW = fridgeArea.clientWidth * scale;
    const viewH = fridgeArea.clientHeight * scale;

    mapCtx.fillStyle = 'rgba(255, 0, 0, 0.2)'; 
    mapCtx.fillRect(viewX, viewY, viewW, viewH);
    mapCtx.strokeStyle = 'red'; 
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(viewX, viewY, viewW, viewH);

    let labelIndex = 0;
    const userGroups = {};

    for (let id in clientItems) {
        const item = clientItems[id];
        const u = item.username || "Unknown";
        if (!userGroups[u]) userGroups[u] = { stickies: [], magnets: [] };
        if (item.type === 'sticky') userGroups[u].stickies.push(item);
        else userGroups[u].magnets.push(item);
    }

    function applyLabel(minX, maxX, y, user) {
        let div;
        if (labelIndex < activeLabels.length) {
            div = activeLabels[labelIndex];
        } else {
            div = document.createElement('div');
            div.className = 'made-by-label';
            labelContainer.appendChild(div);
            activeLabels.push(div);
        }
        div.style.display = 'flex';
        div.innerText = `Made by ${user}`;
        div.style.left = minX + 'px';
        div.style.top = y + 'px';
        div.style.width = Math.max((maxX - minX), 100) + 'px'; 
        labelIndex++;
    }

    for (let user in userGroups) {
        userGroups[user].stickies.forEach(sticky => {
            applyLabel(sticky.x, sticky.x + 200, sticky.y + 225, user);
        });

        let magnets = userGroups[user].magnets;
        magnets.sort((a, b) => a.x - b.x); 

        let currentGroup = [];
        magnets.forEach(mag => {
            if (currentGroup.length === 0) {
                currentGroup.push(mag);
            } else {
                const lastMag = currentGroup[currentGroup.length - 1];
                if (Math.abs(mag.x - lastMag.x) < 60 && Math.abs(mag.y - lastMag.y) < 30) {
                    currentGroup.push(mag); 
                } else {
                    const minX = currentGroup[0].x;
                    const maxX = currentGroup[currentGroup.length - 1].x + 40;
                    const avgY = currentGroup.reduce((sum, m) => sum + m.y, 0) / currentGroup.length;
                    applyLabel(minX, maxX, avgY + 45, user);
                    
                    currentGroup = [mag];
                }
            }
        });
        
        if (currentGroup.length > 0) {
            const minX = currentGroup[0].x;
            const maxX = currentGroup[currentGroup.length - 1].x + 40;
            const avgY = currentGroup.reduce((sum, m) => sum + m.y, 0) / currentGroup.length;
            applyLabel(minX, maxX, avgY + 45, user);
        }
    }

    for (let i = labelIndex; i < activeLabels.length; i++) {
        activeLabels[i].style.display = 'none';
    }
}

setInterval(updateGameLoop, 33);

let isDraggingMap = false;
function navigateMap(e) {
    const rect = miniMap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const targetX = (clickX / scale) - (fridgeArea.clientWidth / 2);
    const targetY = (clickY / scale) - (fridgeArea.clientHeight / 2);
    fridgeArea.scrollLeft = targetX;
    fridgeArea.scrollTop = targetY;
}

miniMap.addEventListener('pointerdown', (e) => { isDraggingMap = true; navigateMap(e); });
window.addEventListener('pointerup', () => { isDraggingMap = false; });
miniMap.addEventListener('pointermove', (e) => { if (isDraggingMap) navigateMap(e); });

const playlist = ['bgm1.mp3', 'bgm2.mp3', 'bgm3.mp3', 'bgm4.mp3']; 
let currentSongIndex = 0;
const bgmPlayer = document.getElementById('bgm');
let musicStarted = false;

window.onload = () => {
    const centerScrollX = (fridgeSurface.offsetWidth - fridgeArea.clientWidth) / 2;
    const centerScrollY = (fridgeSurface.offsetHeight - fridgeArea.clientHeight) / 2;
    fridgeArea.scrollLeft = centerScrollX;
    fridgeArea.scrollTop = centerScrollY;
};

document.body.addEventListener('pointerdown', () => {
    if (!musicStarted && document.getElementById('instructions-modal').classList.contains('hidden')) {
        musicStarted = true;
        if (!bgmPlayer.getAttribute('src')) {
            bgmPlayer.src = playlist[currentSongIndex];
        }
        bgmPlayer.play().catch(error => console.warn("Could not play background music.", error));
    }
}); 

bgmPlayer.addEventListener('ended', () => {
    currentSongIndex = (currentSongIndex + 1) % playlist.length;
    bgmPlayer.src = playlist[currentSongIndex];
    bgmPlayer.play().catch(error => console.warn("Could not play the next track.", error));
});


socket.on('connect', () => {
    socket.emit('registerUser', { ownerId: myId, username: currentUsername });

    // --- NEW FEATURE: Attempt to restore items if the server wiped! ---
    const backup = localStorage.getItem('fridgeBackup');
    if (backup) {
        try {
            const parsedBackup = JSON.parse(backup);
            // Send our saved items to the server. The server will only accept them if it's currently empty!
            socket.emit('restoreMyItems', { ownerId: myId, items: parsedBackup });
        } catch(e) {
            console.warn("Could not load backup", e);
        }
    }
});

socket.on('usernameConfirmed', (confirmedName) => {
    currentUsername = confirmedName;
    usernameInput.value = currentUsername; 
    localStorage.setItem('fridgeUsername', currentUsername); 
    
    for (let id in clientItems) {
        if (clientItems[id].owner === myId) {
            clientItems[id].username = currentUsername;
        }
    }
});

socket.on('initFridge', (items) => {
    clientItems = items; 
    for (let id in items) {
        renderItem(items[id]);
    }
});

socket.on('itemAdded', (itemData) => {
    clientItems[itemData.id] = itemData; 
    renderItem(itemData);
});

socket.on('itemMoved', (data) => {
    if (clientItems[data.id]) {
        clientItems[data.id].x = data.x;
        clientItems[data.id].y = data.y;
    }
    const el = document.getElementById(data.id);
    if (el) {
        el.style.left = data.x + 'px';
        el.style.top = data.y + 'px';
    }
});

socket.on('usernameUpdated', (data) => {
    for (let id in clientItems) {
        if (clientItems[id].owner === data.ownerId) {
            clientItems[id].username = data.newUsername;
        }
    }
});

socket.on('modeUpdated', (data) => {
    if (clientItems[data.id]) {
        clientItems[data.id].isDrawingMode = data.isDrawingMode;
    }
    const el = document.getElementById(data.id);
    if (el) {
        const toggleBtn = el.querySelector('.toggle-mode');
        const canvas = el.querySelector('canvas');
        const textarea = el.querySelector('textarea');
        
        if (toggleBtn) {
            toggleBtn.innerText = data.isDrawingMode ? "Draw Mode" : "Type Mode";
        }
        
        if (canvas && textarea) {
            if (data.isDrawingMode) {
                canvas.style.display = 'block';
                textarea.style.display = 'none';
            } else {
                canvas.style.display = 'none';
                textarea.style.display = 'block';
            }
        }
    }
});

socket.on('drawingUpdated', (data) => {
    if (clientItems[data.id]) clientItems[data.id].canvasData = data.canvasData;
    const el = document.getElementById(data.id);
    if (el) {
        const canvas = el.querySelector('canvas');
        if(canvas) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = data.canvasData;
        }
    }
});

socket.on('textUpdated', (data) => {
    if (clientItems[data.id]) clientItems[data.id].text = data.text;
    const el = document.getElementById(data.id);
    if (el) {
        const textarea = el.querySelector('textarea');
        if (textarea) textarea.value = data.text;
    }
});

socket.on('itemDeleted', (id) => {
    delete clientItems[id]; 
    const el = document.getElementById(id);
    if (el) el.remove();
});

socket.on('itemsDeleted', (idsArray) => {
    idsArray.forEach(id => {
        delete clientItems[id]; 
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    if (idsArray.length > 0) {
        sfxDelete.play().catch(e => console.warn(e));
    }
});

function checkCollision(testLeft, testTop, width, height, myItemId) {
    for (let id in clientItems) {
        const other = clientItems[id];
        
        if (other.id !== myItemId) {
            const otherW = other.type === 'sticky' ? 200 : 40;
            const otherH = other.type === 'sticky' ? 220 : 40;

            if (
                testLeft < other.x + otherW &&
                testLeft + width > other.x &&
                testTop < other.y + otherH &&
                testTop + height > other.y
            ) {
                return true; 
            }
        }
    }
    return false;
}

const inventory = document.getElementById('inventory-area');
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
letters.forEach(letter => {
    let btn = document.createElement('div');
    btn.className = 'magnet';
    btn.style.position = 'relative'; 
    btn.innerText = letter;
    btn.addEventListener('pointerdown', () => createNewItem('magnet', letter));
    inventory.appendChild(btn);
});

document.getElementById('add-sticky').addEventListener('click', () => {
    createNewItem('sticky', '');
});

function createNewItem(type, content) {
    const itemId = myId + '-' + Date.now(); 
    
    const myW = type === 'sticky' ? 200 : 40; 
    const myH = type === 'sticky' ? 220 : 40; 
    const widthOffset = myW / 2; 
    const heightOffset = myH / 2; 
    
    let spawnX = fridgeArea.scrollLeft + (fridgeArea.clientWidth / 2) - widthOffset;
    let spawnY = fridgeArea.scrollTop + (fridgeArea.clientHeight / 2) - heightOffset;

    let angle = 0;
    let radius = 0;
    while (checkCollision(spawnX, spawnY, myW, myH, itemId)) {
        radius += 15; 
        angle += Math.PI / 4; 
        spawnX = (fridgeArea.scrollLeft + (fridgeArea.clientWidth / 2) - widthOffset) + (radius * Math.cos(angle));
        spawnY = (fridgeArea.scrollTop + (fridgeArea.clientHeight / 2) - heightOffset) + (radius * Math.sin(angle));
    }

    const itemData = {
        id: itemId,
        owner: myId,
        username: currentUsername, 
        type: type,
        content: content,
        x: spawnX,
        y: spawnY,
        isDrawingMode: true 
    };

    clientItems[itemId] = itemData; 
    renderItem(itemData);
    socket.emit('newItem', itemData);
    
    sfxPlace.play().catch(error => console.warn(error));
}

function renderItem(data) {
    if (document.getElementById(data.id)) return; 

    const isOwner = data.owner === myId;

    const el = document.createElement('div');
    el.id = data.id;
    el.className = data.type === 'magnet' ? 'magnet' : 'sticky-note';
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
    
    if (data.type === 'magnet') {
        el.innerText = data.content;
        setupDragging(el, el, data); 
    } 
    else {
        el.innerHTML = `
            <div class="drag-handle">Drag Here</div>
            <div class="drawing-toolbar">
                <input type="color" class="color-picker" value="#000000" title="Color">
                <button class="eraser-btn" title="Eraser">🗑️</button>
                <input type="range" class="brush-size" min="1" max="20" value="3" title="Brush Size">
                <button class="toggle-mode">Draw Mode</button>
            </div>
            <div class="note-content">
                <canvas width="200" height="170"></canvas>
                <textarea class="handwritten" spellcheck="false" placeholder="Write something..."></textarea>
            </div>
        `;

        const dragHandle = el.querySelector('.drag-handle');
        setupDragging(el, dragHandle, data);

        const canvas = el.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        const textarea = el.querySelector('textarea');
        const toolbar = el.querySelector('.drawing-toolbar');
        const toggleBtn = el.querySelector('.toggle-mode');
        const colorPicker = el.querySelector('.color-picker');
        const brushSize = el.querySelector('.brush-size');
        const eraserBtn = el.querySelector('.eraser-btn'); 

        let isDrawingMode = data.isDrawingMode !== false; 
        let isErasingMode = false; 

        if (data.text) textarea.value = data.text;
        if (data.canvasData) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = data.canvasData;
        }

        if (isDrawingMode) {
            canvas.style.display = 'block';
            textarea.style.display = 'none';
        } else {
            canvas.style.display = 'none';
            textarea.style.display = 'block';
        }

        if (isOwner) {
            toggleBtn.innerText = isDrawingMode ? "Draw Mode" : "Type Mode";

            eraserBtn.addEventListener('click', () => {
                isErasingMode = !isErasingMode;
                if (isErasingMode) {
                    eraserBtn.style.backgroundColor = '#ccc'; 
                    ctx.globalCompositeOperation = 'destination-out'; 
                } else {
                    eraserBtn.style.backgroundColor = '#fff';
                    ctx.globalCompositeOperation = 'source-over';
                }
            });

            colorPicker.addEventListener('change', () => {
                colorPicker.blur(); 
                if (isErasingMode) {
                    isErasingMode = false;
                    eraserBtn.style.backgroundColor = '#fff';
                    ctx.globalCompositeOperation = 'source-over';
                }
            });

            toggleBtn.addEventListener('click', () => {
                isDrawingMode = !isDrawingMode;
                if (isDrawingMode) {
                    canvas.style.display = 'block';
                    textarea.style.display = 'none';
                    toggleBtn.innerText = "Draw Mode";
                } else {
                    canvas.style.display = 'none';
                    textarea.style.display = 'block';
                    textarea.focus();
                    toggleBtn.innerText = "Type Mode";
                }
                socket.emit('updateMode', { id: data.id, isDrawingMode: isDrawingMode, ownerId: myId });
            });

            textarea.addEventListener('input', () => {
                if (clientItems[data.id]) clientItems[data.id].text = textarea.value;
                socket.emit('updateText', { id: data.id, text: textarea.value, ownerId: myId });
            });

            let isDrawing = false;
            canvas.addEventListener('pointerdown', (e) => {
                isDrawing = true;
                ctx.beginPath();
                ctx.moveTo(e.offsetX, e.offsetY);
            });

            canvas.addEventListener('pointermove', (e) => {
                if (isDrawing) {
                    ctx.strokeStyle = colorPicker.value; 
                    ctx.lineWidth = brushSize.value;
                    ctx.lineCap = 'round';
                    ctx.lineTo(e.offsetX, e.offsetY);
                    ctx.stroke();
                }
            });

            canvas.addEventListener('pointerup', () => {
                isDrawing = false;
                const url = canvas.toDataURL();
                if (clientItems[data.id]) clientItems[data.id].canvasData = url;
                socket.emit('updateDrawing', { id: data.id, canvasData: url, ownerId: myId });
            });
            
            canvas.addEventListener('pointerleave', () => {
                if (isDrawing) {
                    isDrawing = false;
                    const url = canvas.toDataURL();
                    if (clientItems[data.id]) clientItems[data.id].canvasData = url;
                    socket.emit('updateDrawing', { id: data.id, canvasData: url, ownerId: myId });
                }
            });
        } else {
            toolbar.style.display = 'none'; 
            textarea.readOnly = true;       
            dragHandle.innerText = "";
        }
    }

    const clearBtn = document.createElement('button');
    clearBtn.innerText = "Clear?";
    clearBtn.className = "clear-btn";
    el.appendChild(clearBtn);

    let idleTimer;
    let longPressTimer;
    let startX = 0, startY = 0;

    const showClearBtn = () => {
        if (isOwner) clearBtn.style.display = 'block';
    };
    const hideClearBtn = () => {
        clearBtn.style.display = 'none';
    };

    const resetIdleTimer = (e) => {
        if (e && e.pointerType !== 'mouse') return;
        if (clearBtn.style.display === 'block') return;

        clearTimeout(idleTimer);
        hideClearBtn();

        if (isOwner) idleTimer = setTimeout(showClearBtn, 2000);
    };

    el.addEventListener('pointerenter', resetIdleTimer);
    el.addEventListener('pointermove', resetIdleTimer);
    el.addEventListener('pointerleave', (e) => {
        if (e && e.pointerType !== 'mouse') return;
        clearTimeout(idleTimer);
        hideClearBtn();
    });

    el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return; 
        
        if (e.target === clearBtn || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;

        if (clearBtn.style.display === 'block') {
            hideClearBtn();
            return;
        }

        startX = e.clientX;
        startY = e.clientY;

        if (isOwner) {
            longPressTimer = setTimeout(showClearBtn, 2000);
        }
    });

    const cancelLongPress = (e) => {
        if (e && e.pointerType === 'mouse') return;
        clearTimeout(longPressTimer);
    };

    el.addEventListener('pointerup', cancelLongPress);
    el.addEventListener('pointercancel', cancelLongPress);

    el.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') return;
        if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
            cancelLongPress();
        }
    });

    clearBtn.addEventListener('click', () => {
        if (isOwner) {
            socket.emit('deleteItem', { id: data.id, ownerId: myId });
            el.remove();
            sfxDelete.play().catch(error => console.warn(error));
        }
    });

    fridgeSurface.appendChild(el);
}

function setupDragging(mainElement, dragTarget, data) {
    if (data.owner !== myId) {
        dragTarget.style.cursor = 'default';
        mainElement.style.cursor = 'default';
        return; 
    }

    let isDragging = false;
    
    dragTarget.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; 
        isDragging = true;
        fridgeSurface.appendChild(mainElement); 
    });

    document.addEventListener('pointermove', (e) => {
        if (isDragging) {
            const surfaceRect = fridgeSurface.getBoundingClientRect();
            
            const targetX = e.clientX - surfaceRect.left - (mainElement.offsetWidth / 2);
            const targetY = e.clientY - surfaceRect.top - (dragTarget.offsetHeight / 2); 

            const myW = mainElement.offsetWidth;
            const myH = mainElement.offsetHeight;

            let newX = parseFloat(mainElement.style.left) || targetX;
            let newY = parseFloat(mainElement.style.top) || targetY;

            if (!checkCollision(targetX, newY, myW, myH, data.id)) newX = targetX;
            if (!checkCollision(newX, targetY, myW, myH, data.id)) newY = targetY;

            mainElement.style.left = newX + 'px';
            mainElement.style.top = newY + 'px';

            if(clientItems[data.id]) {
                clientItems[data.id].x = newX;
                clientItems[data.id].y = newY;
            }

            socket.emit('moveItem', { id: data.id, x: newX, y: newY, ownerId: myId });
        }
    });

    document.addEventListener('pointerup', () => {
        isDragging = false;
    });
}
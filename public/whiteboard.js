// ------------------------------ Front-end logic for the collaborative whiteboard ------------------------------


// -------------------------------------------------------------------------
// Grab all the DOM elements needed (connect JS to UI)
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvasContainer');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const connectionStatus = document.getElementById('connectionStatus');
const penTool = document.getElementById('penTool');
const textTool = document.getElementById('textTool');
const colorPicker = document.getElementById('colorPicker');
const strokeWidth = document.getElementById('strokeWidth');
const strokeValue = document.getElementById('strokeValue');
const clearBtn = document.getElementById('clearBtn');
const textInputOverlay = document.getElementById('textInputOverlay');
const textInput = document.getElementById('textInput');
// -------------------------------------------------------------------------

// Create a Socket.IO connection to the server
const socket = io(); // allows real-time syncing between users

// Initialize app state variables to track what the user is currently doing
let currentTool = 'pen';
let isDrawing = false;
let currentStroke = null;
let currentRoom = null;

// Drawing settings that can be changed by the user
let settings = {
    color: '#000000',
    lineWidth: 3,
    fontSize: 16
};

// Initialize variables to store all drawing strokes and text locally
let strokes = [];
let texts = [];

// ------------------------------------------------------------------------------------------------------------
// Functions to handle drawing, text input, tool selection, room joining, and real-time updates via Socket.IO
// ------------------------------------------------------------------------------------------------------------

// Resize the canvas to match its container
// Also handles high-DPI screens so drawings don’t look blurry
function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    // Resizing complete -> redraw the canvas
    redrawCanvas();
}

// Function to clear the canvas and redraw all strokes + text
// Used after resize, clear, or syncing state
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    strokes.forEach(stroke => drawStroke(stroke));
    texts.forEach(text => drawText(text));
}

// Function to draw a stroke on the canvas
function drawStroke(stroke) {
    // Ignore strokes that are invalid or too short
    if (!stroke.points || stroke.points.length < 2) return;
    // Start a new drawing path
    ctx.beginPath();
    ctx.strokeStyle = stroke.color; // Colour
    ctx.lineWidth = stroke.width; // Line width/thickness
    ctx.lineCap = 'round'; // Smooth line ends
    ctx.lineJoin = 'round'; // Smooth line corners
    
    // move to starting point
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    
    // Draw lines through all remaining points using a loop
    for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    
    // Render stroke onto whiteboard
    ctx.stroke();
}

// Function to draw a text label onto the canvas
function drawText(textObj) {
    // Set font size and family
    ctx.font = `${textObj.fontSize || 16}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    // Set text colour
    ctx.fillStyle = textObj.color;
    // Render text at the specified position
    ctx.fillText(textObj.content, textObj.x, textObj.y);
}


// Function to create mouse or touch events into canvas coordinates to keep drawing accurate across devices
function getPosition(e) {
    const rect = canvas.getBoundingClientRect(); // Get canvas position
    // Check if there is a touch input
    if (e.touches && e.touches.length > 0) { 
        return {
            // Return first touch point
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }
    
    // Otherwise fall back to the mouse coordinates
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

// Function to start drawing a new stroke on the canvas when the user presses down with the pen tool
function startDrawing(e) {
    // If the pen tool isn't active or user is not in a room, ignore
    if (currentTool !== 'pen' || !currentRoom) return;

    e.preventDefault(); // Prevent default browser behavior
    isDrawing = true;

    // Get the current mouse or touch position relative to the canvas
    const pos = getPosition(e);
    // Initialize a new stroke object with starting point, color, and width
    currentStroke = {
        points: [pos], // Array of points in this stroke
        color: settings.color,  // colour
        width: settings.lineWidth // width
    };
}

// Function to continue drawing the current stroke as the mouse or finger moves, and send live updates to other users
function draw(e) {
    // If user is not actively drawing, using the pen, or in a room, ignore
    if (!isDrawing || currentTool !== 'pen' || !currentRoom) return;

    e.preventDefault();
    const pos = getPosition(e); // Get current position
    currentStroke.points.push(pos); // Add this point to the current stroke

    // Show the stroke while its being drawn
    drawStroke(currentStroke);

    // Emit a "drawing" update to the server so other users can see it live
    socket.emit('drawing', {
        point: pos,
        color: settings.color,
        width: settings.lineWidth
    });
}

// Function to finish the current stroke when the user releases the mouse or lifts their finger, and broadcast it if it's meaningful
function stopDrawing(e) {
    // Do nothing if we weren't drawing or no stroke exists
    if (!isDrawing || !currentStroke) return;

    isDrawing = false; // Reset drawing flag

    // Only save and send strokes that have at least 2 points to ignore accidental clicks
    if (currentStroke.points.length > 1) {
        strokes.push(currentStroke); // Add stroke to local history
        socket.emit('draw-stroke', currentStroke); // Send to server for other users
    }

    currentStroke = null; // Terminate the current stroke when finished
}


// Function to handle clicks on the canvas for placing text when the text tool is active
function handleCanvasClick(e) {
    if (currentTool !== 'text' || !currentRoom) return;

    const pos = getPosition(e);

    // Show the text input overlay at the click position and store coordinates for later submission
    textInputOverlay.style.display = 'block';
    textInputOverlay.style.left = pos.x + 'px';
    textInputOverlay.style.top = pos.y + 'px';
    textInput.value = '';
    textInput.focus();

    textInput.dataset.x = pos.x;
    textInput.dataset.y = pos.y;
}

// Function to submit typed text to the canvas, draw it locally, and broadcast it to other users
function submitText() {
    const content = textInput.value.trim();
    // Check for input
    if (!content) {
        textInputOverlay.style.display = 'none';
        return;
    }
    // Process text position, content, colour, and size
    const textObj = {
        x: parseFloat(textInput.dataset.x),
        y: parseFloat(textInput.dataset.y),
        content,
        color: settings.color,
        fontSize: settings.fontSize
    };

    texts.push(textObj); // Update locally
    drawText(textObj); // Show the text on the canvas
    socket.emit('add-text', textObj); // Display on the server for other users
    // Hide the input overlay and clear its value for the next input
    textInputOverlay.style.display = 'none';
    textInput.value = '';
}

// Function to switch between pen and text tools and update the cursor and UI accordingly
function selectTool(tool) {
    currentTool = tool;
    // Highlight the active/selected tool on the screen
    penTool.classList.toggle('active', tool === 'pen');
    textTool.classList.toggle('active', tool === 'text');
    // Change the cursor style depending on the tool
    canvas.style.cursor = tool === 'pen' ? 'crosshair' : 'text';
}

// Function to clear the entire board for everyone in the room when the user confirms
function clearBoard() {
    if (!currentRoom) return;
    // Ask for confirmation before clearing
    if (confirm('Are you sure? This will clear the board for everyone.')) {
        socket.emit('clear-board'); // Clear on server for all users
    }
}

// Function to update the connection status UI to show if the user is connected to a room or not
function updateConnectionStatus(connected, roomName = null) {
    if (connected && roomName) {
        connectionStatus.classList.add('connected'); // Add green connected styling
        connectionStatus.querySelector('.status-text').textContent = `Connected to: ${roomName}`; // Show room name
    } else {
        connectionStatus.classList.remove('connected'); // Remove connected styling
        connectionStatus.querySelector('.status-text').textContent = 'Disconnected'; // Show disconnected
    }
}

// Function to join a room when the user enters a room name, send the join event, and update the URL
function joinRoom() {
    const roomName = roomInput.value.trim(); // Get the room name from the input
    // Check if a room name was entered
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    currentRoom = roomName; // Set the current room
    socket.emit('join-room', roomName); // Notify server to join the room
    // Update the URL so it reflects the current room without reloading the page
    window.history.pushState({}, '', `/room/${roomName}`);
}

// ------------------------------------------------------------------------------------------------------------
// Socket.IO event handlers - handle real-time communication with the server
// ------------------------------------------------------------------------------------------------------------

// When the client successfully connects to the server
socket.on('connect', () => {
    console.log('Connected to server');
    
    // Auto-join room from URL if present (ex: /room/my-board)
    const pathMatch = window.location.pathname.match(/^\/room\/(.+)$/);
    if (pathMatch) {
        const roomName = decodeURIComponent(pathMatch[1]);

        roomInput.value = roomName; // Show room name in input box
        currentRoom = roomName; // Set current room locally
        socket.emit('join-room', roomName); // Update the server
    }
});

// When the client disconnects from the server
socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false); // Update UI to show disconnection
});

// When joining a room, receive the current state (all existing strokes and text)
socket.on('room-state', (state) => {
    console.log('Received room state:', state);
    
    // Load existing strokes and texts from the room
    strokes = state.strokes || [];
    texts = state.texts || [];
    
    // Redraw everything so the new user sees what's already on the board
    redrawCanvas();
    updateConnectionStatus(true, currentRoom); // Show connection
});

// When another user draws a stroke add it to the canvas
socket.on('stroke-drawn', (stroke) => {
    strokes.push(stroke); // Save the stroke locally
    drawStroke(stroke); // Draw it on the canvas
});

// Handle Live Updates: when another user is actively drawing
socket.on('drawing', (data) => {
    // Draw a small circle to show live drawing from other users
    ctx.beginPath();
    ctx.arc(data.point.x, data.point.y, data.width / 2, 0, Math.PI * 2);
    ctx.fillStyle = data.color;
    ctx.fill(); // Only temporary feedback, not saved yet
});

// When another user adds text, display it on the canvas
socket.on('text-added', (textObj) => {
    texts.push(textObj); // Save locally
    drawText(textObj); // Show it on the whiteboard
});

// When the board is cleared (by any user) clear the local state
socket.on('board-cleared', () => {
    strokes = []; // Remove all strokes
    texts = []; // Remove all text
    redrawCanvas(); // Refresh the canvas to show it's empty
});

// When another user joins the room (for logging/debugging)
socket.on('user-joined', (userId) => {
    console.log('User joined:', userId); // Just log for now
});

// When another user leaves the room (for logging/debugging)
socket.on('user-left', (userId) => {
    console.log('User left:', userId); // Just log for now
});

// ------------------------------------------------------------------------------------------------------------
// Event listeners - connect UI interactions to our functions
// ------------------------------------------------------------------------------------------------------------

// Handle window resize to adjust canvas size
window.addEventListener('resize', resizeCanvas); // Keep canvas responsive

// Mouse events for drawing
canvas.addEventListener('mousedown', startDrawing); // Start stroke
canvas.addEventListener('mousemove', draw); // Continue stroke
canvas.addEventListener('mouseup', stopDrawing); // Finish stroke
canvas.addEventListener('mouseleave', stopDrawing); // Finish if mouse leaves
canvas.addEventListener('click', handleCanvasClick); // Place text

// Touch events for mobile/tablet drawing
canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing);
canvas.addEventListener('touchcancel', stopDrawing);

// Tool button clicks
penTool.addEventListener('click', () => selectTool('pen')); // Switch to pen
textTool.addEventListener('click', () => selectTool('text')); // Switch to text
clearBtn.addEventListener('click', clearBoard); // Clear the board

// Settings controls
colorPicker.addEventListener('input', (e) => {
    settings.color = e.target.value; // Update pen/text color
});

strokeWidth.addEventListener('input', (e) => {
    settings.lineWidth = parseInt(e.target.value); // Update stroke width
    strokeValue.textContent = e.target.value; // Show current width
});

// Text input handling
textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitText(); // Submit text on Enter
    else if (e.key === 'Escape') textInputOverlay.style.display = 'none'; // Cancel on Escape
});

textInput.addEventListener('blur', () => {
    // Small delay to allow click events to process before hiding input
    setTimeout(() => {
        if (textInputOverlay.style.display !== 'none') {
            submitText(); // Auto-submit if user clicks away
        }
    }, 100);
});

// Room join controls
joinBtn.addEventListener('click', joinRoom); // Join room when clicking button
roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom(); // Join room on Enter key
});

// ------------------------------------------------------------------------------------------------------------
// Initialize the application
// ------------------------------------------------------------------------------------------------------------
resizeCanvas(); // Make sure canvas is sized correctly on load
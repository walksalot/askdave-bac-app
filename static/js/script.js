document.addEventListener('DOMContentLoaded', () => {
    const bacForm = document.getElementById('bac-form');
    const weightInput = document.getElementById('weight');
    const maleRadio = document.getElementById('male');
    const femaleRadio = document.getElementById('female');
    const beerSelect = document.getElementById('drinks_beer');
    const wineSelect = document.getElementById('drinks_wine');
    const shotSelect = document.getElementById('drinks_shot');
    const timeHoursInput = document.getElementById('time_hours');
    const timeMinutesInput = document.getElementById('time_minutes');
    const resultTextContainer = document.getElementById('result-text-container');
    const bacResultText = document.getElementById('bac-result-text');
    const warningText = document.getElementById('warning-text');
    const errorMessageDiv = document.querySelector('.error-message');
    const canvas = document.getElementById('bacChart');
    const infoIcon = document.getElementById('info-icon');
    const infoPopup = document.getElementById('standard-drink-popup');
    const graphContainer = document.querySelector('.graph-container');
    const graphColumn = document.querySelector('.graph-column');
    const statusOverlay = document.getElementById('status-overlay');
    const statusOverlayText = document.getElementById('status-overlay-text');
    const calculateButton = bacForm ? bacForm.querySelector('button[type="submit"]') : null;

    if (!canvas || !bacForm || !resultTextContainer || !bacResultText || !warningText || !errorMessageDiv) {
        console.error("Essential page element not found!");
        return; // Stop script if core elements are missing
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("Could not get canvas context!");
        return;
    }

    let bacChart = null;
    let currentBacAnnotation = {};
    let overlayTimeout = null;
    let deck = [];
    let playerCards = [];
    let dealerCards = [];
    let playerScore = 0;
    let dealerScore = 0;
    let gameInProgress = false;
    let listenersAttached = false;
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    console.log('Script loaded. Checking for ChartAnnotation...');
    console.log('ChartAnnotation object:', window.ChartAnnotation);

    // Register the annotation plugin if available
    // if (window.ChartAnnotation) { Chart.register(window.ChartAnnotation); console.log("ChartAnnotation registered."); }
    // else { console.warn("ChartAnnotation plugin check skipped for debugging."); }

    // Function to create chart options dynamically
    function createChartOptions(yMax, xMax, currentHour, currentBACValue) {
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false, // Allow slight negative min for padding
                    title: {
                        display: true,
                        text: 'BAC (%)',
                        font: { size: 14 }
                    },
                    ticks: {
                        callback: function(value) {
                            if (typeof value === 'number') {
                                return value.toFixed(3);
                            }
                            return value;
                        }
                    },
                    max: yMax,
                    suggestedMin: -0.005 // Small negative min for visual padding below zero
                },
                x: {
                    title: {
                        display: true,
                        text: 'Hours Since First Drink',
                        font: { size: 14 }
                    },
                    min: 0, // Ensure x-axis starts at 0
                    max: xMax
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed && typeof context.parsed.y === 'number') {
                                label += context.parsed.y.toFixed(3) + ' %';
                            } else {
                                label += 'N/A';
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    display: false
                }
            },
            elements: {
                line: {
                    tension: 0.2,
                    borderColor: '#3b82f6', // Tailwind Blue 500
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2.5
                },
                point: {
                    radius: 0, // Hide default points
                    hoverRadius: 5, // Show points on hover
                    hoverBackgroundColor: '#3b82f6',
                    hoverBorderColor: '#fff',
                    hoverBorderWidth: 2
                }
            }
        };
        console.log('Generated Chart Options (No Annotations):', options);
        return options;
    }

    // --- Set Default Form Values ---
    function setDefaultValues() {
        if (weightInput) weightInput.value = '240';
        if (maleRadio) maleRadio.checked = true;
        if (beerSelect) beerSelect.value = '2';
        if (wineSelect) wineSelect.value = '1';
        if (shotSelect) shotSelect.value = '1';
        if (timeHoursInput) timeHoursInput.value = '2';
        if (timeMinutesInput) timeMinutesInput.value = '30';
    }

    setDefaultValues(); // Call this function when the DOM is ready

    // --- Info Popup Logic ---
    if (infoIcon && infoPopup) {
        infoIcon.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from immediately closing popup
            infoPopup.classList.toggle('visible');
        });

        // Close popup if clicking outside
        document.addEventListener('click', (event) => {
            if (!infoPopup.contains(event.target) && !infoIcon.contains(event.target)) {
                infoPopup.classList.remove('visible');
            }
        });

        // Close popup with Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                 infoPopup.classList.remove('visible');
            }
        });
    } else {
        console.warn("Info icon or popup element not found.");
    }

    // --- Form Submission Logic ---
    const handleBacCalculation = async (event) => {
        console.error("--> handleBacCalculation FUNCTION CALLED <--- Type:", event.type);
        // ** MUST BE FIRST LINE **
        event.preventDefault();
        event.stopPropagation(); // Add stopPropagation for good measure
        console.log("Default form submission prevented.");

        clearPreviousResults();

        const formData = new FormData(bacForm);
        const data = {};
        let timeHours = 0, timeMinutes = 0;
        formData.forEach((value, key) => {
            if (key === 'time_hours') timeHours = parseInt(value, 10) || 0;
            else if (key === 'time_minutes') timeMinutes = parseInt(value, 10) || 0;
            else data[key] = value;
        });
        const totalDecimalHours = timeHours + (timeMinutes / 60.0);
        data['hours'] = totalDecimalHours;

        if (!data.weight || data.weight <= 0 || !data.gender || data.hours < 0 || timeMinutes > 59) {
            displayError("Please fill in all fields with valid values.");
            return;
        }

        if(calculateButton) calculateButton.disabled = true; calculateButton.textContent = 'Calculating...';

        try {
            const response = await fetch('/calculate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP Error: ${response.status}`);
            if (result.error) throw new Error(result.error);

            console.log("Calculation successful:", result);
            displayBacResults(result);
            generateChartData(result);
            handleStatusUpdate(result);

        } catch (error) {
            console.error('Calculation error:', error);
            displayError(error.message || "Calculation error.");
        } finally {
             if(calculateButton) calculateButton.disabled = false; calculateButton.textContent = 'Calculate BAC & Show Graph';
        }
    };

    // --- Helper Functions ---

    function clearPreviousResults() {
        console.log("Clearing previous results...");
        if (errorMessageDiv) errorMessageDiv.style.display = 'none'; errorMessageDiv.textContent = '';
        if (resultTextContainer) resultTextContainer.style.display = 'none';
        if (bacResultText) bacResultText.textContent = '-';
        if (warningText) warningText.textContent = '';
        if (bacChart) { bacChart.destroy(); bacChart = null; }
        if (graphColumn) graphColumn.classList.remove('visible');
        if (overlayTimeout) clearTimeout(overlayTimeout);
        if (statusOverlay) statusOverlay.classList.remove('visible', 'status-good', 'status-careful', 'status-nah');
        hideBlackjack();
    }

    function displayError(message) {
        console.error("Displaying Error:", message);
        if(errorMessageDiv) { errorMessageDiv.textContent = `Error: ${message}`; errorMessageDiv.style.display = 'block'; }
        if(resultTextContainer) resultTextContainer.style.display = 'none';
        if (bacChart) { bacChart.destroy(); bacChart = null; }
        if (graphColumn) graphColumn.classList.remove('visible');
        if (overlayTimeout) clearTimeout(overlayTimeout);
        if (statusOverlay) statusOverlay.classList.remove('visible', 'status-good', 'status-careful', 'status-nah');
        hideBlackjack();
    }

    function displayBacResults(resultData) {
         if(errorMessageDiv) errorMessageDiv.style.display = 'none';
         if(bacResultText) bacResultText.textContent = `${resultData.current_bac} %`;
         if(warningText) warningText.textContent = `(Graph shows projection)`;
         if(resultTextContainer) resultTextContainer.style.display = 'block';
    }

    function handleStatusUpdate(resultData) {
        const bacFloat = parseFloat(resultData.current_bac);
        let statusMsg = '', statusClass = '', showBlackjack = false;

        if (isNaN(bacFloat)) {
            statusMsg = "Error?"; statusClass = 'status-nah';
        } else if (bacFloat >= 0.08) {
            statusMsg = "Nah bruh 🛑"; statusClass = 'status-nah'; showBlackjack = true;
            if(blackjackMessage) blackjackMessage.textContent = "Whoa! Maybe Blackjack it off?";
        } else if (bacFloat >= 0.04) {
             statusMsg = "Careful bruh 👀"; statusClass = 'status-careful';
        } else {
            statusMsg = "You good bruh 👍"; statusClass = 'status-good';
        }

        triggerOverlay(statusMsg, statusClass);

        if (showBlackjack) {
            console.log("BAC >= 0.08, showing Blackjack and starting new game.")
            if(blackjackContainer) blackjackContainer.classList.add('visible');
            startNewBlackjackGame();
        } else {
            hideBlackjack();
        }
    }

    function triggerOverlay(message, statusClass) {
        if (!statusOverlay || !statusOverlayText) return;
        console.log(`Triggering overlay: ${message}, Class: ${statusClass}`);
        if (overlayTimeout) clearTimeout(overlayTimeout);
        statusOverlay.className = 'status-overlay';
        void statusOverlay.offsetWidth;
        statusOverlayText.textContent = message;
        statusOverlay.classList.add(statusClass);
        statusOverlay.classList.add('visible');
        overlayTimeout = setTimeout(() => { statusOverlay.classList.remove('visible'); }, 3500);
    }

    function generateChartData(resultData) {
        const peakBac = parseFloat(resultData.peak_bac);
        const metabolismRate = parseFloat(resultData.metabolism_rate);
        const currentHour = parseFloat(resultData.hours_since_first_drink);
        const currentBACValue = parseFloat(resultData.current_bac);
        const absoluteMaxHours = 10;

        if (isNaN(peakBac) || isNaN(metabolismRate) || isNaN(currentHour) || isNaN(currentBACValue)) {
            console.error("Invalid data received for chart generation:", resultData);
            displayError("Could not generate graph due to invalid calculation data.");
            return;
        }

        let zeroHour = 0;
        if (metabolismRate > 0) {
             zeroHour = peakBac / metabolismRate;
        }

        // Determine the maximum hour for the X axis
        // Add a 1.5 hour buffer past the zero hour or current hour, round up, cap
        const bufferHours = 1.5;
        const suggestedXMax = Math.ceil(Math.max(currentHour, zeroHour) + bufferHours);
        const finalXMax = Math.min(suggestedXMax, absoluteMaxHours);

        // Generate data points up to the determined X axis max
        const totalHoursToPlot = finalXMax;

        const labels = [];
        const dataPoints = [];

        for (let h = 0; h <= totalHoursToPlot; h += 0.5) {
            labels.push(h.toFixed(1));
            let bacAtHourH = peakBac - (metabolismRate * h);
            dataPoints.push(Math.max(0, bacAtHourH));
        }

        // Adjust Y max calculation slightly
        const dynamicYMax = Math.max(0.10, peakBac * 1.15 + 0.01); // Add small fixed padding

        drawChart(labels, dataPoints, dynamicYMax.toFixed(3), finalXMax, currentHour, currentBACValue, true);
    }

    function drawChart(labels, dataPoints, yMax, xMax, currentHour, currentBACValue, showGraph = false) {
        const newOptions = createChartOptions(yMax, xMax, currentHour, currentBACValue);
        console.log('Attempting to draw/update chart with options:', newOptions);

        const chartConfig = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Estimated BAC',
                    data: dataPoints,
                    fill: true
                }]
            },
            options: newOptions
        };

        if (bacChart) {
            console.log("Destroying old chart to re-create.");
            bacChart.destroy();
            bacChart = null;
        }

        if (!bacChart) {
            if (!ctx) {
                console.error("Cannot draw chart, canvas context is missing.");
                return;
            }
            try {
                console.log("Creating new Chart with config:", chartConfig);
                bacChart = new Chart(ctx, chartConfig);
                console.log("Chart created successfully.");
            } catch (e) {
                console.error("Error creating chart:", e);
                displayError("Failed to create the BAC graph. Check console.");
                return;
            }
        }

        // Toggle graph column visibility
        if (showGraph && graphColumn) {
            graphColumn.classList.add('visible');
        }
    }

    // --- Blackjack Game Elements & Logic ---
    const blackjackContainer = document.getElementById('blackjack-container');
    const blackjackMessage = document.getElementById('blackjack-message');
    const dealerScoreEl = document.getElementById('dealer-score');
    const playerScoreEl = document.getElementById('player-score');
    const dealerCardsEl = document.getElementById('dealer-cards');
    const playerCardsEl = document.getElementById('player-cards');
    const blackjackResultEl = document.getElementById('blackjack-result');
    const hitButton = document.getElementById('btn-hit');
    const standButton = document.getElementById('btn-stand');
    const newGameButton = document.getElementById('btn-new-game');

    // --- Blackjack Game Functions ---

    // Creates a standard 52-card deck
    function createDeck() {
        deck = [];
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ suit, value });
            }
        }
    }

    // Shuffles the deck using Fisher-Yates algorithm
    function shuffleDeck() {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    // Gets the numerical value of a card (A=11 initially, J/Q/K=10)
    function getCardValue(card) {
        if (['J', 'Q', 'K'].includes(card.value)) return 10;
        if (card.value === 'A') return 11; // Handle Ace as 11 initially
        return parseInt(card.value);
    }

    // Calculates the score of a hand, adjusting for Aces
    function calculateScore(hand) {
        let score = hand.reduce((sum, card) => sum + getCardValue(card), 0);
        let aceCount = hand.filter(card => card.value === 'A').length;
        // Adjust for Aces if score is over 21
        while (score > 21 && aceCount > 0) {
            score -= 10;
            aceCount--;
        }
        return score;
    }

    // Creates and appends a card element to the UI
    function renderCard(card, element, hideFirstDealerCard = false) {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card');
        const isRed = ['♥', '♦'].includes(card.suit);
        cardDiv.classList.add(isRed ? 'red' : 'black');

        // Hide dealer's first card
        if (element === dealerCardsEl && dealerCardsEl.children.length === 0 && hideFirstDealerCard) {
             cardDiv.innerHTML = '?';
             cardDiv.classList.add('hidden-card'); // Optional style for hidden
        } else {
            cardDiv.innerHTML = `${card.value}${card.suit}`;
        }
        element.appendChild(cardDiv);
    }

    // Updates the displayed scores based on current hands
    function updateScores(revealDealer = false) {
        playerScore = calculateScore(playerCards);
        dealerScore = calculateScore(dealerCards);
        playerScoreEl.textContent = playerScore;

        // Update dealer score display based on game state
        if (revealDealer || !gameInProgress || dealerCards.length < 2) {
            dealerScoreEl.textContent = dealerScore; // Show full score when revealed or game over
        } else {
             // Show only the value of the second card initially
             dealerScoreEl.textContent = dealerCards.length > 1 ? getCardValue(dealerCards[1]) : '?';
             // Add hidden card logic if needed here or in renderCard
             if (dealerCardsEl.children.length > 0 && !dealerCardsEl.children[0].classList.contains('hidden-card')) {
                // If first card element exists but isn't hidden, show ?
                 dealerScoreEl.textContent += ' + ?';
             } else if (dealerCards.length === 1) {
                 dealerScoreEl.textContent = '?';
             }
        }
        console.log(`Scores Updated - Player: ${playerScore}, Dealer: ${dealerScoreEl ? dealerScoreEl.textContent : 'N/A'}`);
    }

    // Deals the initial two cards to player and dealer
    function dealInitialCards() {
        playerCards.push(deck.pop());
        dealerCards.push(deck.pop());
        playerCards.push(deck.pop());
        dealerCards.push(deck.pop());

        dealerCardsEl.innerHTML = '';
        playerCardsEl.innerHTML = '';

        renderCard(dealerCards[0], dealerCardsEl, true); // Pass true to hide first card
        renderCard(dealerCards[1], dealerCardsEl);
        renderCard(playerCards[0], playerCardsEl);
        renderCard(playerCards[1], playerCardsEl);
        updateScores(false); // Update scores, keep dealer hidden
    }

    // Checks if the game has ended (player bust, blackjack)
    function checkGameOver(isInitialDeal = false) {
        let gameOver = false;
        let message = "";
        playerScore = calculateScore(playerCards); // Ensure score is current

        console.log(`Checking Game Over - Player Score: ${playerScore}`);

        if (playerScore > 21) {
            message = "You busted! Dealer wins. 😭";
            gameOver = true;
        } else if (isInitialDeal && playerScore === 21) { // Player Blackjack on deal
             dealerScore = calculateScore(dealerCards);
             if (dealerScore === 21) { // Dealer also Blackjack
                 message = "Push! Both have Blackjack. 🤝";
             } else {
                 message = "Blackjack! You win! 😎";
             }
             gameOver = true;
        }
        // Note: Player hitting to 21 isn't an auto-win, they must stand.

        if (gameOver) {
             endGame(message);
        }
        return gameOver;
    }

    // Reveals the dealer's hidden first card
    function revealDealerCard() {
        console.log("Revealing dealer card");
        if (dealerCardsEl.children.length > 0 && dealerCards.length > 0) {
            const firstCardEl = dealerCardsEl.children[0];
            if (firstCardEl && firstCardEl.classList.contains('hidden-card')) {
                firstCardEl.innerHTML = `${dealerCards[0].value}${dealerCards[0].suit}`;
                firstCardEl.classList.remove('hidden-card');
            }
        }
        // Update score display to show full score
        updateScores(true);
    }

    // Handles the dealer's turn logic (hitting until 17+)
    function dealerTurn() {
        console.log("Dealer Turn Starts");
        revealDealerCard(); // Reveal and update score display

        // Use setInterval for a slight delay between dealer hits for visual effect
        const dealerInterval = setInterval(() => {
            dealerScore = calculateScore(dealerCards); // Recalculate each time
            if (dealerScore < 17) {
                console.log(`Dealer score ${dealerScore}, Dealer Hits`);
                const newCard = deck.pop();
                if (!newCard) {
                    console.error("Deck empty during dealer turn!");
                    clearInterval(dealerInterval);
                    endGame("Deck empty!"); // Or handle differently
                    return;
                }
                dealerCards.push(newCard);
                renderCard(dealerCards[dealerCards.length - 1], dealerCardsEl);
                updateScores(true); // Update and reveal score
            } else {
                // Stop hitting
                clearInterval(dealerInterval);
                console.log("Dealer Stands with score:", dealerScore);
                // Determine winner after dealer stops
                if (dealerScore > 21) {
                    endGame("Dealer busted! You win! 🎉");
                } else if (dealerScore > playerScore) {
                    endGame("Dealer wins. 😭");
                } else if (dealerScore < playerScore) {
                    endGame("You win! 😎");
                } else { // dealerScore === playerScore
                    endGame("Push! 🤝");
                }
            }
        }, 800); // Delay between dealer hits (800ms)
    }

    // Finalizes the game, displays message, disables buttons
    function endGame(message) {
        console.error("!!! END GAME CALLED !!! Message:", message);
        if (!gameInProgress) {
            console.warn("endGame called but game already not in progress.");
            return; // Prevent multiple calls
        }
        gameInProgress = false; // Set BEFORE disabling buttons
        console.log("Game state set to:", gameInProgress);
        if(hitButton) hitButton.disabled = true;
        if(standButton) standButton.disabled = true;
        blackjackResultEl.textContent = message;
        revealDealerCard();
    }

    // Resets the game state and deals new hands
    function startNewBlackjackGame() {
        if (!blackjackContainer) { console.error("Cannot start BJ: container missing"); return; }
        console.log("--- Starting New Blackjack Game ---");
        gameInProgress = true;
        blackjackResultEl.textContent = '';
        createDeck();
        shuffleDeck();
        playerCards = [];
        dealerCards = [];
        dealInitialCards(); // Deals & updates scores

        const gameOverOnDeal = checkGameOver(true);

        // Enable buttons ONLY if the game didn't end on the deal
        if (!gameOverOnDeal) {
            console.log("Enabling player actions.");
            if (hitButton) hitButton.disabled = false;
            if (standButton) standButton.disabled = false;
        } else {
             console.log("Game ended on deal, buttons remain disabled.");
             if (hitButton) hitButton.disabled = true;
             if (standButton) standButton.disabled = true;
        }
    }

    // Attaches event listeners to the Blackjack buttons (run once)
    function setupBlackjackListenersOnce() {
         if (listenersAttached) {
             console.log("BJ Listeners already attached.");
             return;
         }
         console.log("Attaching Blackjack listeners...");
         if (!hitButton || !standButton || !newGameButton) {
             console.error("CRITICAL ERROR: Cannot attach BJ listeners - Buttons missing!");
             return;
         }

         hitButton.addEventListener('click', () => {
             console.log("Hit clicked. gameInProgress:", gameInProgress);
             if (!gameInProgress) return;
             console.log("Executing Hit...");
             const newCard = deck.pop();
             if (newCard) {
                 playerCards.push(newCard);
                 renderCard(newCard, playerCardsEl);
                 updateScores(false);
                 checkGameOver(false); // Check for bust only
             }
         });

         standButton.addEventListener('click', () => {
             console.log("Stand clicked. gameInProgress:", gameInProgress);
             if (!gameInProgress) return;
             console.log("Executing Stand...");
             if(hitButton) hitButton.disabled = true;
             if(standButton) standButton.disabled = true;
             dealerTurn();
         });

         newGameButton.addEventListener('click', () => {
             console.log("New Game clicked.");
             startNewBlackjackGame();
         });

         listenersAttached = true;
         console.log("Blackjack listeners attached.");
    }

    // Hides the Blackjack game area and stops the game
    function hideBlackjack() {
        console.log("Hiding Blackjack container.");
        if (!blackjackContainer) return;
        blackjackContainer.classList.remove('visible');
        if (gameInProgress) { // Only log if a game was actually in progress
             console.log("Setting gameInProgress to false due to hide.");
             gameInProgress = false;
        }
        // Disable buttons when hiding regardless of game state
        if(hitButton) hitButton.disabled = true;
        if(standButton) standButton.disabled = true;
    }

    // --- Event Listeners Setup ---
    function setupListeners() {
        console.log("Setting up listeners...");
        if (bacForm) {
            bacForm.addEventListener('submit', handleBacCalculation);
            console.log("--> BAC form SUBMIT listener ATTACHED.");
        } else {
            console.error("CRITICAL: BAC Form not found! Cannot attach submit listener.");
        }
        // Setup other listeners (Info Popup, Blackjack)
        if (infoIcon && infoPopup) {
            setupInfoPopupListeners();
            console.log("Info popup listeners attached.");
        }
        setupBlackjackListenersOnce();
    }

    // --- Info Popup Logic ---
    function setupInfoPopupListeners() {
        if (infoIcon && infoPopup) {
            infoIcon.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent click from immediately closing popup
                infoPopup.classList.toggle('visible');
            });

            // Close popup if clicking outside
            document.addEventListener('click', (event) => {
                if (!infoPopup.contains(event.target) && !infoIcon.contains(event.target)) {
                    infoPopup.classList.remove('visible');
                }
            });

            // Close popup with Escape key
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                     infoPopup.classList.remove('visible');
                }
            });
        } else {
            console.warn("Info icon or popup element not found.");
        }
    }

    // --- Initialization ---
    console.log("DOM Loaded. Initializing...");
    // Temporarily disable annotation plugin logic
    // if (window.ChartAnnotation) { Chart.register(window.ChartAnnotation); console.log("ChartAnnotation registered."); }
    // else { console.warn("ChartAnnotation plugin check skipped for debugging."); }
    setDefaultValues();
    setupListeners(); // Combined setup function
    if (errorMessageDiv) errorMessageDiv.style.display = 'none';
    hideBlackjack();

});

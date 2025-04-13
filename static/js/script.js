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

    console.log('Script loaded. Checking for ChartAnnotation...');
    console.log('ChartAnnotation object:', window.ChartAnnotation);

    // Register the annotation plugin if available
    if (window.ChartAnnotation) {
        try {
            Chart.register(window.ChartAnnotation);
            console.log("ChartAnnotation plugin registered successfully.");
        } catch (e) {
            console.error("Failed to register ChartAnnotation plugin:", e);
        }
    } else {
        console.warn("Chart.js Annotation plugin was not found on window object.");
    }

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
                },
                annotation: {
                    drawTime: 'beforeDatasetsDraw',
                    annotations: {
                        legalLimitLine: {
                            type: 'line',
                            yMin: 0.08,
                            yMax: 0.08,
                            borderColor: 'rgba(255, 99, 132, 0.8)',
                            borderWidth: 2,
                            borderDash: [6, 6],
                            label: {
                                content: 'Legal Limit (0.08%)',
                                position: 'start',
                                display: true,
                                color: 'rgb(255, 99, 132)',
                                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                                font: { weight: 'normal', size: 10 },
                                yAdjust: -5 // Adjust label position slightly
                            }
                        },
                        // Add current BAC point annotation dynamically if valid
                        ...(currentHour !== null && currentBACValue !== null && !isNaN(currentHour) && !isNaN(currentBACValue) && {
                             currentBacPoint: {
                                type: 'point',
                                xValue: currentHour.toFixed(1),
                                yValue: currentBACValue,
                                backgroundColor: 'rgba(255, 159, 64, 0.9)', // Orange point
                                radius: 6,
                                borderColor: 'rgba(255, 159, 64, 1)',
                                borderWidth: 2,
                                label: {
                                    content: `Current: ${currentBACValue.toFixed(3)}%`,
                                    display: true,
                                    position: 'top',
                                    backgroundColor: 'rgba(255, 159, 64, 0.8)',
                                    color: '#fff',
                                    font: { size: 10, weight: 'bold'},
                                    yAdjust: -10
                                }
                             }
                        })
                    }
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
        console.log('Generated Chart Options:', options);
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
    const calculateButton = bacForm.querySelector('button[type="submit"]');
    bacForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearPreviousResults();

        const formData = new FormData(bacForm);
        const data = {};
        // Specific handling for time
        let timeHours = 0;
        let timeMinutes = 0;

        formData.forEach((value, key) => {
            if (key === 'time_hours') {
                timeHours = parseInt(value, 10) || 0;
            } else if (key === 'time_minutes') {
                timeMinutes = parseInt(value, 10) || 0;
            } else {
                data[key] = value; // Collect other data normally
            }
        });

        // Calculate total hours in decimal format for backend
        const totalDecimalHours = timeHours + (timeMinutes / 60.0);
        data['hours'] = totalDecimalHours; // Add to data object sent to backend

        // Basic client-side validation
        if (!data.weight || data.weight <= 0 || !data.gender || data.hours < 0) { // Check calculated hours
            displayError("Please fill in all fields with valid values (Weight > 0, Time >= 0).");
            return;
        }
        // Ensure minutes are within range if provided
        if (timeMinutes < 0 || timeMinutes > 59) {
             displayError("Minutes must be between 0 and 59.");
             return;
        }

        try {
            calculateButton.disabled = true;
            calculateButton.textContent = 'Calculating...';

            const response = await fetch('/calculate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Calculation failed (Status: ${response.status})`);
            }

            if (result.error) {
                displayError(result.error);
                hideBlackjack(); // Hide game on error
            } else {
                displayResults(result);
                generateChartData(result);
            }

        } catch (error) {
            console.error('Calculation error:', error);
            displayError(error.message || "An error occurred during calculation.");
            hideBlackjack(); // Hide game on fetch error
        } finally {
            calculateButton.disabled = false;
            calculateButton.textContent = 'Calculate BAC & Show Graph';
        }
    });

    // --- Helper Functions ---

    function clearPreviousResults() {
        errorMessageDiv.style.display = 'none';
        errorMessageDiv.textContent = '';
        resultTextContainer.style.display = 'none';
        bacResultText.textContent = '-';
        warningText.textContent = '';
        if (bacChart) {
            bacChart.destroy();
            bacChart = null;
        }
        if (graphColumn) {
            graphColumn.classList.remove('visible');
        }
        if (overlayTimeout) clearTimeout(overlayTimeout);
        if (statusOverlay) statusOverlay.classList.remove('visible', 'status-good', 'status-careful', 'status-nah');
        hideBlackjack();
    }

    function displayError(message) {
        errorMessageDiv.textContent = `Error: ${message}`;
        errorMessageDiv.style.display = 'block';
        resultTextContainer.style.display = 'none';
        if (bacChart) {
             bacChart.destroy();
             bacChart = null;
        }
        if (graphColumn) {
            graphColumn.classList.remove('visible');
        }
        if (overlayTimeout) clearTimeout(overlayTimeout);
        if (statusOverlay) statusOverlay.classList.remove('visible', 'status-good', 'status-careful', 'status-nah');
        hideBlackjack();
    }

    function displayResults(resultData) {
        errorMessageDiv.style.display = 'none';
        bacResultText.textContent = `${resultData.current_bac} %`;
        warningText.textContent = `(Graph shows projection)`;
        resultTextContainer.style.display = 'block';

        const bacFloat = parseFloat(resultData.current_bac);
        let statusMsg = '';
        let statusClass = '';
        let showBlackjackGame = false;

        if (isNaN(bacFloat)) {
            statusMsg = "Error?";
            statusClass = 'status-nah';
        } else if (bacFloat >= 0.08) {
            statusMsg = "Nah bruh 🛑";
            statusClass = 'status-nah';
            showBlackjackGame = true; // SHOW GAME
            blackjackMessage.textContent = "Whoa there! Maybe Blackjack it off till you're under 0.08?";
        } else if (bacFloat >= 0.04) {
             statusMsg = "Careful bruh 👀";
             statusClass = 'status-careful';
        } else {
            statusMsg = "You good bruh 👍";
            statusClass = 'status-good';
        }

        if (statusOverlay && statusOverlayText) {
            if (overlayTimeout) clearTimeout(overlayTimeout);
            statusOverlay.classList.remove('visible', 'status-good', 'status-careful', 'status-nah');

            void statusOverlay.offsetWidth;

            statusOverlayText.textContent = statusMsg;
            statusOverlay.classList.add(statusClass);

            statusOverlay.classList.add('visible');

            overlayTimeout = setTimeout(() => {
                statusOverlay.classList.remove('visible');
            }, 3500);
        }

        // Show/Hide Blackjack based on status
        if (showBlackjackGame) {
            blackjackContainer.classList.add('visible');
            startNewBlackjackGame(); // Start game when shown
        } else {
            hideBlackjack();
        }
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

    let deck = [];
    let playerCards = [];
    let dealerCards = [];
    let playerScore = 0;
    let dealerScore = 0;
    let gameInProgress = false;
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    // --- Blackjack Game Functions ---

    function createDeck() {
        deck = [];
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ suit, value });
            }
        }
    }

    function shuffleDeck() {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    function getCardValue(card) {
        if (['J', 'Q', 'K'].includes(card.value)) return 10;
        if (card.value === 'A') return 11; // Handle Ace as 11 initially
        return parseInt(card.value);
    }

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

    function updateScores() {
        playerScore = calculateScore(playerCards);
        dealerScore = calculateScore(dealerCards);
        playerScoreEl.textContent = playerScore;
         // Only show full dealer score when game ends or if showing hole card logic is complex
        if (!gameInProgress || dealerCards.length < 2) {
            dealerScoreEl.textContent = dealerCards.length > 0 ? getCardValue(dealerCards[0]) + ' + ?' : '?';
        } else {
            dealerScoreEl.textContent = dealerScore;
        }
    }

    function dealInitialCards() {
        playerCards.push(deck.pop());
        dealerCards.push(deck.pop());
        playerCards.push(deck.pop());
        dealerCards.push(deck.pop());

        dealerCardsEl.innerHTML = '';
        playerCardsEl.innerHTML = '';

        renderCard(dealerCards[0], dealerCardsEl, true); // Hide first dealer card
        renderCard(dealerCards[1], dealerCardsEl);
        renderCard(playerCards[0], playerCardsEl);
        renderCard(playerCards[1], playerCardsEl);

        updateScores();
    }

    function checkGameOver() {
        if (playerScore > 21) {
            endGame("You busted! Dealer wins.");
            return true;
        }
        // Check for Blackjack immediately after deal
        if (playerCards.length === 2 && playerScore === 21) {
            // Dealer checks for blackjack only if player has one
            if (calculateScore(dealerCards) === 21) {
                 endGame("Push! Both have Blackjack.");
            } else {
                 endGame("Blackjack! You win!");
            }
            revealDealerCard();
            return true;
        }
        return false;
    }

    function revealDealerCard() {
        console.log("Revealing dealer card");
         if (dealerCardsEl.children.length > 0 && dealerCards.length > 0) {
             const firstCardEl = dealerCardsEl.children[0];
             if (firstCardEl && firstCardEl.classList.contains('hidden-card')) {
                 firstCardEl.innerHTML = `${dealerCards[0].value}${dealerCards[0].suit}`;
                 firstCardEl.classList.remove('hidden-card');
                 console.log("Dealer first card revealed:", dealerCards[0]);
             }
             // Always update the score display after revealing
             dealerScore = calculateScore(dealerCards);
             dealerScoreEl.textContent = dealerScore;
             console.log("Dealer score after reveal:", dealerScore);
         }
    }

    function dealerTurn() {
        console.log("Dealer Turn Starts");
        revealDealerCard();

        // Dealer hits until score is 17 or higher
        while (calculateScore(dealerCards) < 17) { // Recalculate score each loop
             console.log(`Dealer score ${calculateScore(dealerCards)}, Dealer Hits`);
             const newCard = deck.pop();
             if (!newCard) {
                 console.error("Deck empty during dealer turn!");
                 break; // Prevent error if deck runs out (unlikely with 1 deck)
             }
             dealerCards.push(newCard);
             renderCard(dealerCards[dealerCards.length - 1], dealerCardsEl);
             // Update internal score variable for next loop check
             dealerScore = calculateScore(dealerCards);
             dealerScoreEl.textContent = dealerScore; // Update displayed score
        }

        // Update final dealer score display after hitting stops
        dealerScore = calculateScore(dealerCards);
        dealerScoreEl.textContent = dealerScore;
        console.log("Dealer final score:", dealerScore);

        // Determine winner
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

    function endGame(message) {
        console.log("Ending game:", message);
        gameInProgress = false;
        hitButton.disabled = true;
        standButton.disabled = true;
        blackjackResultEl.textContent = message;
        // Ensure dealer card is revealed and final score shown
        revealDealerCard();
    }

    function startNewBlackjackGame() {
        createDeck();
        shuffleDeck();
        playerCards = [];
        dealerCards = [];
        playerScore = 0;
        dealerScore = 0;
        gameInProgress = true;

        dealerCardsEl.innerHTML = '';
        playerCardsEl.innerHTML = '';
        blackjackResultEl.textContent = '';
        dealerScoreEl.textContent = '?';
        playerScoreEl.textContent = '0';

        hitButton.disabled = false;
        standButton.disabled = false;

        dealInitialCards();
        // Check for immediate player Blackjack
        checkGameOver();
    }

    function setupBlackjackListeners() {
         hitButton.addEventListener('click', () => {
            if (!gameInProgress) return;
            console.log("Player Hits");
            playerCards.push(deck.pop());
            renderCard(playerCards[playerCards.length - 1], playerCardsEl);
            updateScores();
            // Check if player busted *after* updating scores
            if (checkGameOver()) {
                 console.log("Game Over after Hit");
                 return; // Stop if player busted
            }
        });

        standButton.addEventListener('click', () => {
            if (!gameInProgress) return;
            console.log("Player Stands");
            hitButton.disabled = true;
            standButton.disabled = true;
            // Ensure dealerTurn logic executes fully
            try {
                dealerTurn();
            } catch(e) {
                console.error("Error during dealer turn:", e);
                blackjackResultEl.textContent = "Error during dealer turn!";
            }
        });

        newGameButton.addEventListener('click', startNewBlackjackGame);
    }

    function hideBlackjack() {
         if (blackjackContainer) {
            blackjackContainer.classList.remove('visible');
            // Optionally clear game state when hiding?
            // gameInProgress = false;
         }
    }

});

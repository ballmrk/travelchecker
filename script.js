document.addEventListener('DOMContentLoaded', () => {
    // Handle subscription form submit
    const subscribeForm = document.getElementById('subscribe-form');
    if (subscribeForm) {
        subscribeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('email-input');
            const email = emailInput.value.trim();
            const subscribeMessage = document.getElementById('subscribe-message');

            if (!email) {
                subscribeMessage.textContent = "Please enter a valid email.";
                subscribeMessage.style.color = 'red';
                return;
            }

            const backendUrl = 'https://polar-ocean-34033-d5a9931b2079.herokuapp.com'; // Your Heroku backend

            try {
                const response = await fetch(`${backendUrl}/api/subscribe`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({email})
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    subscribeMessage.textContent = "Error: " + (errorData.error || "Failed to subscribe.");
                    subscribeMessage.style.color = 'red';
                } else {
                    const result = await response.json();
                    subscribeMessage.textContent = result.message || "Subscribed successfully!";
                    subscribeMessage.style.color = 'green';
                    emailInput.value = ''; 
                }
            } catch (err) {
                console.error("Error subscribing:", err);
                subscribeMessage.textContent = "An error occurred. Please try again later.";
                subscribeMessage.style.color = 'red';
            }
        });
    }

    fetchDataAndUpdateUI();
});

// Fetch data from backend and update UI
async function fetchDataAndUpdateUI() {
    const backendUrl = 'https://polar-ocean-34033-d5a9931b2079.herokuapp.com'; // Your Heroku backend
    const loadingOverlay = document.getElementById('loading-overlay');

    try {
        const response = await fetch(`${backendUrl}/api/bestday`);
        if (!response.ok) {
            throw new Error("Failed to fetch data from server.");
        }
        const data = await response.json();
        const { bestDay, dayScores, vegasForecast, minnesotaForecast } = data;

        // Hide loading overlay
        if (loadingOverlay) loadingOverlay.style.display = 'none';

        // Display score breakdown and other info
        displayScore(bestDay, vegasForecast, minnesotaForecast);
        drawMultiDayChart(dayScores);

    } catch (error) {
        console.error(error);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        // Show an error message to user
        const alertMessages = document.getElementById('alert-messages');
        if (alertMessages) {
            alertMessages.innerHTML = `<div style="color:red;">Error: ${error.message}</div>`;
        }
    }
}

function displayScore(bestDay, vegasForecast, minnesotaForecast) {
    const {score, flightPrice, flightDetails, alternativeFlights, breakdown} = bestDay;
    const chosenDate = bestDay.date;

    // UPDATED: Set the best-day-date element to highlight chosen day
    const bestDayDateElem = document.getElementById('best-day-date');
    if (bestDayDateElem) {
        bestDayDateElem.textContent = chosenDate;
    }

    // Alerts if any
    const alertContainer = document.getElementById('alert-messages');
    if (alertContainer) {
        alertContainer.innerHTML = '';
        let alerts = [];
        let mnMaxSnow = Math.max(...minnesotaForecast.map(d => d.snow));
        if (mnMaxSnow > 6) {
            alerts.push("Severe Weather Alert: Heavy snowfall expected in Minnesota!");
        }
        if (flightPrice !== null && flightPrice > 500) {
            alerts.push("Expensive Flight Alert: Flights cost more than $500!");
        }
        if (alerts.length > 0) {
            alertContainer.innerHTML = alerts.map(msg => `<div>${msg}</div>`).join('');
        }
    }

    // UPDATED: Friendlier Score Breakdown
    const breakdownList = document.getElementById('breakdown-list');
    if (breakdownList) {
        let breakdownHTML = `
            <li><strong>Airfare Value:</strong> ${breakdown.flightPoints.toFixed(2)} – Reflects how affordable flights are. Higher is better.</li>
            <li><strong>MN Cold Weather Penalty:</strong> ${breakdown.coldPoints.toFixed(2)} – Negative means colder Minnesota weather, adding incentive to leave.</li>
            <li><strong>Vegas Weather Bonus:</strong> ${breakdown.vegasPoints.toFixed(2)} – Positive values mean nicer weather in Vegas.</li>
            <li><strong>Snow Event Adjustment:</strong> ${breakdown.snowPoints.toFixed(2)} – Points added if snow or poor conditions make leaving MN more appealing.</li>
            <li><strong>Extra Snowy Days Bonus:</strong> ${breakdown.extraSnowPoints.toFixed(2)} – Additional points for especially snowy conditions.</li>
        `;
        if (breakdown.severeBonus && breakdown.severeBonus > 0) {
            breakdownHTML += `<li><strong>Severe Weather Bonus:</strong> ${breakdown.severeBonus.toFixed(2)}</li>`;
        }
        breakdownHTML += `<li><strong>Total Score:</strong> ${score.toFixed(2)}</li>`;
        breakdownList.innerHTML = breakdownHTML;
    }

    const results = document.getElementById('results');
    let flightLink = `https://www.google.com/travel/flights?q=Flights%20from%20MSP%20to%20LAS%20on%20${encodeURIComponent(chosenDate)}`;

    // Create Vegas forecast rows
    const vegasRows = vegasForecast.slice(1,8).map(d => {
        let highlightClass = d.date === chosenDate ? 'highlight-row' : '';
        let rainText = d.rain > 0 ? d.rain.toFixed(2) + " in rain" : "";
        let iconUrl = weatherIconUrl(d.icon);
        return `<tr class="${highlightClass}">
            <td>${d.date}</td>
            <td>${d.temp.toFixed(1)}°F</td>
            <td><img class="weather-icon" src="${iconUrl}" alt="${d.condition}"> ${d.condition}</td>
            <td>${rainText}</td>
        </tr>`;
    }).join('');

    // Create MN forecast rows
    const mnRows = minnesotaForecast.slice(1,8).map(d => {
        let highlightClass = d.date === chosenDate ? 'highlight-row' : '';
        let snowText = d.snow > 0 ? d.snow.toFixed(2) + " in snow" : "";
        let iconUrl = weatherIconUrl(d.icon);
        let wc = dailyWindchill(d.temp, d.wind_speed).toFixed(1) + "°F";
        return `<tr class="${highlightClass}">
            <td>${d.date}</td>
            <td>${d.temp.toFixed(1)}°F</td>
            <td><img class="weather-icon" src="${iconUrl}" alt="${d.condition}"> ${d.condition}</td>
            <td>${snowText}</td>
            <td>${wc}</td>
        </tr>`;
    }).join('');

    let flightInfoHTML = "";
    if (flightDetails) {
        // UPDATED: More conversational flight info
        flightInfoHTML = `
            <p><strong>Selected One-Way Flight:</strong></p>
            <ul>
              <li><strong>Airline:</strong> ${flightDetails.carrier}</li>
              <li><strong>Flight #:</strong> ${flightDetails.flightNumber}</li>
              <li><strong>Departs:</strong> ${flightDetails.departureTime}</li>
              <li><strong>Arrives:</strong> ${flightDetails.arrivalTime}</li>
            </ul>
        `;
    }

    let alternativesHTML = "";
    if (alternativeFlights && alternativeFlights.length > 0) {
        alternativesHTML = `<h4>Alternative Flight Options:</h4><ul>`;
        alternativeFlights.forEach(alt => {
            alternativesHTML += `<li>$${alt.price} - ${alt.carrier}, Flight #${alt.flightNumber}, Departs ${alt.departureTime}, Arrives ${alt.arrivalTime}</li>`;
        });
        alternativesHTML += `</ul>`;
    }

    // UPDATED: More friendly explanation
    if (results) {
        results.innerHTML = `
            <h2>Details for Best Day: ${chosenDate}</h2>
            <p><strong>Flight Price:</strong> ${flightPrice !== null ? '$' + flightPrice : 'No flights found'}<br>
            <a href="${flightLink}" target="_blank">Check Flights for ${chosenDate}</a></p>

            ${flightInfoHTML}
            ${alternativesHTML}

            <h3>Las Vegas 7-Day Forecast</h3>
            <table>
            <tr><th>Date</th><th>Temp</th><th>Condition</th><th>Rain</th></tr>
            ${vegasRows}
            </table>

            <h3>Minneapolis 7-Day Forecast (With Windchill)</h3>
            <table>
            <tr><th>Date</th><th>Temp</th><th>Condition</th><th>Snow</th><th>Windchill</th></tr>
            ${mnRows}
            </table>
            <p><em>Currently showing the best day within the next 7 days. I’m working on expanding this to show 10 or even 16 days soon!</em></p>
        `;
    }

    // Load gauge and draw
    google.charts.load('current', { 'packages': ['gauge'] });
    google.charts.setOnLoadCallback(() => drawGauge(score));
}

function drawGauge(score) {
    var data = google.visualization.arrayToDataTable([
        ['Label', 'Value'],
        ['Score', score]
    ]);

    var options = {
        width: 300,
        height: 200,
        redFrom: 0, redTo: 40,
        yellowFrom:40, yellowTo:70,
        greenFrom:70, greenTo:100,
        minorTicks: 5,
        max: 100,
        min: 0
    };

    var chart = new google.visualization.Gauge(document.getElementById('gauge_div'));
    chart.draw(data, options);
}

function drawMultiDayChart(dayScores) {
    google.charts.load('current', {'packages':['corechart']});
    google.charts.setOnLoadCallback(function() {
        var data = new google.visualization.DataTable();
        data.addColumn('string', 'Date');
        data.addColumn('number', 'Score');

        dayScores.forEach(dp => {
            data.addRow([dp.date, dp.score]);
        });

        var options = {
            title: 'Score Over the Next 7 Days',
            curveType: 'function',
            legend: { position: 'bottom' },
            width: 550,
            height: 400,
            // Ensure points are visible
            pointsVisible: true,
            // Set the size of the points
            pointSize: 7,
            // Optional: Make the line a bit thicker
            lineWidth: 2,
            // Specify the shape of the points via the series option
            series: {
                0: { pointShape: 'square' }
            }
        };

        var chart = new google.visualization.LineChart(document.getElementById('chart_div'));
        google.visualization.events.addListener(chart, 'select', () => {
            var selection = chart.getSelection();
            if (selection.length > 0) {
                var row = selection[0].row;
                var selectedDay = dayScores[row];
                showDayBreakdown(selectedDay);
            }
        });
        chart.draw(data, options);
    });
}

function showDayBreakdown(dayInfo) {
    const breakdown = dayInfo.breakdown;
    // UPDATED: Friendlier breakdown labels here as well
    let breakdownHTML = `
        <h2>Score Breakdown for ${dayInfo.date}</h2>
        <ul>
            <li><strong>Airfare Value:</strong> ${breakdown.flightPoints.toFixed(2)}</li>
            <li><strong>MN Cold Weather Penalty:</strong> ${breakdown.coldPoints.toFixed(2)}</li>
            <li><strong>Vegas Weather Bonus:</strong> ${breakdown.vegasPoints.toFixed(2)}</li>
            <li><strong>Snow Event Adjustment:</strong> ${breakdown.snowPoints.toFixed(2)}</li>
            <li><strong>Extra Snowy Days Bonus:</strong> ${breakdown.extraSnowPoints.toFixed(2)}</li>
            ${breakdown.severeBonus && breakdown.severeBonus > 0 ? `<li><strong>Severe Weather Bonus:</strong> ${breakdown.severeBonus.toFixed(2)}</li>` : ''}
            <li><strong>Total Score:</strong> ${dayInfo.score.toFixed(2)}</li>
        </ul>

        <p><strong>Flight Price:</strong> ${dayInfo.flightPrice !== null ? '$' + dayInfo.flightPrice.toFixed(2) : 'No flights found'}</p>
    `;

    if (dayInfo.flightDetails) {
        breakdownHTML += `
        <h3>Selected Flight</h3>
        <p><strong>Airline:</strong> ${dayInfo.flightDetails.carrier}<br>
        <strong>Flight #:</strong> ${dayInfo.flightDetails.flightNumber}<br>
        <strong>Departs:</strong> ${dayInfo.flightDetails.departureTime}<br>
        <strong>Arrives:</strong> ${dayInfo.flightDetails.arrivalTime}</p>
        `;
    } else {
        breakdownHTML += `<p>No flight details available for this day.</p>`;
    }

    const dayBreakdownDiv = document.getElementById('day-breakdown');
    if (dayBreakdownDiv) {
        dayBreakdownDiv.innerHTML = breakdownHTML;
    }
}

function weatherIconUrl(iconCode) {
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
}

function dailyWindchill(tempF, windMph) {
    if (tempF <= 50 && windMph >= 3) {
        return 35.74 + 0.6215*tempF - 35.75*(windMph**0.16) + 0.4275*tempF*(windMph**0.16);
    } else {
        return tempF;
    }
}
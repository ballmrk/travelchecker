document.addEventListener('DOMContentLoaded', () => {
    // Fetch data when DOM is ready
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
    const { score, flightPrice, flightDetails, alternativeFlights, breakdown } = bestDay;
    const chosenDate = bestDay.date; // raw date (e.g. "2024-01-15") for comparisons

    // Format the chosenDate into a more Americanized format (e.g., "January 15, 2024")
    const dateObj = new Date(chosenDate);
    const formattedDate = dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const bestDayDateElem = document.getElementById('best-day-date');
    if (bestDayDateElem) {
        bestDayDateElem.textContent = formattedDate;
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

    // Friendlier Score Breakdown
    const breakdownList = document.getElementById('breakdown-list');
    if (breakdownList) {
        let breakdownHTML = '';

        // Always show Airfare Value
        breakdownHTML += `<li><strong>Airfare Value:</strong> ${breakdown.flightPoints.toFixed(2)} – Higher means cheaper, better flight deals.</li>`;
        if (breakdown.coldPoints !== 0) {
            breakdownHTML += `<li><strong>MN Cold Weather Bonus:</strong> ${breakdown.coldPoints.toFixed(2)} – Added if it’s cold in Minnesota, making a warm Vegas getaway more appealing.</li>`;
        }
        if (breakdown.vegasPoints !== 0) {
            breakdownHTML += `<li><strong>Vegas Weather Bonus:</strong> ${breakdown.vegasPoints.toFixed(2)} – Added if Vegas is especially warm and pleasant.</li>`;
        }
        if (breakdown.snowPoints !== 0) {
            breakdownHTML += `<li><strong>Snow Event Adjustment:</strong> ${breakdown.snowPoints.toFixed(2)} – Added if snow or harsh conditions in MN make leaving more tempting.</li>`;
        }
        if (breakdown.extraSnowPoints !== 0) {
            breakdownHTML += `<li><strong>Extra Snowy Days Bonus:</strong> ${breakdown.extraSnowPoints.toFixed(2)} – Extra points if conditions are unusually snowy.</li>`;
        }
        if (breakdown.severeBonus && breakdown.severeBonus > 0) {
            breakdownHTML += `<li><strong>Severe Weather Bonus:</strong> ${breakdown.severeBonus.toFixed(2)} – Awarded if you leave before severe weather hits MN.</li>`;
        }

        // Always show the total score
        breakdownHTML += `<li><strong>Total Score:</strong> ${score.toFixed(2)}</li>`;

        breakdownList.innerHTML = breakdownHTML;
    }

    const results = document.getElementById('results');
    let flightLink = `https://www.google.com/travel/flights?q=Flights%20from%20MSP%20to%20LAS%20on%20${encodeURIComponent(chosenDate)}`;

    // Create Vegas forecast rows (highlight best day)
    const vegasRows = vegasForecast.slice(1, 8).map(d => {
        let highlightClass = (d.date === bestDay.date) ? 'highlight-row' : '';
        let rainText = d.rain > 0 ? d.rain.toFixed(2) + " in rain" : "";
        let iconUrl = weatherIconUrl(d.icon);
        return `<tr class="${highlightClass}">
                <td>${formatForecastDate(d.date)}</td>
                <td>${d.temp.toFixed(1)}°F</td>
                <td><img class="weather-icon" src="${iconUrl}" alt="${d.condition}"> ${d.condition}</td>
                <td>${rainText}</td>
            </tr>`;
    }).join('');

    // Create MN forecast rows (highlight best day)
    const mnRows = minnesotaForecast.slice(1, 8).map(d => {
        let highlightClass = (d.date === bestDay.date) ? 'highlight-row' : '';
        let snowText = d.snow > 0 ? d.snow.toFixed(2) + " in snow" : "";
        let iconUrl = weatherIconUrl(d.icon);
        let wc = dailyWindchill(d.temp, d.wind_speed).toFixed(1) + "°F";
        return `<tr class="${highlightClass}">
                <td>${formatForecastDate(d.date)}</td>
                <td>${d.temp.toFixed(1)}°F</td>
                <td><img class="weather-icon" src="${iconUrl}" alt="${d.condition}"> ${d.condition}</td>
                <td>${snowText}</td>
                <td>${wc}</td>
            </tr>`;
    }).join('');

    let flightInfoHTML = "";
    if (flightDetails) {
        // More conversational flight info
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

    if (results) {
        results.innerHTML = `
            <h2>Details for Best Day: ${formattedDate}</h2>
            <p><strong>Flight Price:</strong> ${flightPrice !== null ? '$' + flightPrice : 'No flights found'}<br>
<a href="${flightLink}" class="flight-button" target="_blank">Check Flights for ${formattedDate}</a>
            ${flightInfoHTML}
            ${alternativesHTML}

            <h3>Las Vegas 7-Day Forecast</h3>
            <table>
            <tr><th>Date</th><th>Temp</th><th>Condition</th><th>Rain</th></tr>
            ${vegasRows}
            </table>

            <h3>Minneapolis 7-Day Forecast</h3>
            <table>
            <tr><th>Date</th><th>Temp</th><th>Condition</th><th>Snow</th><th>Windchill</th></tr>
            ${mnRows}
            </table>
            <p><em>Currently showing the best day within the next 7 days.</em></p>

            <h3>What Does a Perfect (100) Score Day Look Like?</h3>
            <p>A perfect score might look like:</p>
            <ul>
              <li>Flight Price: $150 (low enough to earn maximum flight points)</li>
              <li>Vegas Weather: A comfortable 75°F and sunny</li>
              <li>Minnesota Weather: Extremely cold (e.g., 0°F) with snow on the way</li>
              <li>Leaving just before a severe weather event hits Minnesota</li>
            </ul>
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
        yellowFrom: 40, yellowTo: 70,
        greenFrom: 70, greenTo: 100,
        minorTicks: 5,
        max: 100,
        min: 0
    };

    var chart = new google.visualization.Gauge(document.getElementById('gauge_div'));
    chart.draw(data, options);
}

function drawMultiDayChart(dayScores) {
    google.charts.load('current', { 'packages': ['corechart'] });
    google.charts.setOnLoadCallback(function () {
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
            pointsVisible: true,
            pointSize: 7,
            lineWidth: 2,
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
    let breakdownHTML = `
        <h2>Score Breakdown for ${formatForecastDate(dayInfo.date)}</h2>
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
        return 35.74 + 0.6215 * tempF - 35.75 * (windMph ** 0.16) + 0.4275 * tempF * (windMph ** 0.16);
    } else {
        return tempF;
    }
}

// Helper function to format dates from the forecast arrays to MM/DD/YYYY
function formatForecastDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US');
} 
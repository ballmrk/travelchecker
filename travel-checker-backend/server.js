const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// User preferences and constants (moved from script.js)
const IDEAL_FLIGHT_PRICE = 150;
const MAX_FLIGHT_POINTS = 40;
const MAX_SNOW_INCHES = 4;
const MAX_SNOW_POINTS = 20;
const MAX_CLEAR_POINTS = 15;
const MAX_COLD_POINTS = 15;
const MAX_FLIGHT_VALUE = 300;
const BEFORE_SEVERE_BONUS = 10;
const SCORE_ALERT_THRESHOLD = 60; 
const MAJOR_AIRLINES = ["DL", "AA", "UA", "WN", "AS", "B6", "NK"];
const AIRLINE_NAMES = {
    'DL': 'Delta Air Lines',
    'AA': 'American Airlines',
    'UA': 'United Airlines',
    'WN': 'Southwest Airlines',
    'AS': 'Alaska Airlines',
    'B6': 'JetBlue Airways',
    'NK': 'Spirit Airlines',
    'SY': 'Sun Country'
};
let userPreferences = {
    flightWeight: 1.0,
    coldWeight: 1.0,
    vegasWeatherWeight: 1.0,
    snowWeight: 1.0,
    beforeSevereWeight: 1.0
};

// Functions moved from script.js:

function dailyWindchill(tempF, windMph) {
    if (tempF <= 50 && windMph >= 3) {
        return 35.74 + 0.6215*tempF - 35.75*(windMph**0.16) + 0.4275*tempF*(windMph**0.16);
    } else {
        return tempF;
    }
}

function computeScore(flightPrice, vegasDay, mnDay, isBeforeSevere) {
    let breakdown = {
        flightPoints: 0,
        coldPoints: 0,
        vegasPoints: 0,
        snowPoints: 0,
        extraSnowPoints: 0,
        severeBonus: 0
    };

    let score = 0;

    // Flight Price Points
    if (flightPrice !== null) {
        let flightPoints = 0;
        if (flightPrice <= IDEAL_FLIGHT_PRICE) {
            flightPoints = MAX_FLIGHT_POINTS;
        } else if (flightPrice >= MAX_FLIGHT_VALUE) {
            flightPoints = 0;
        } else {
            let ratio = (MAX_FLIGHT_VALUE - flightPrice) / (MAX_FLIGHT_VALUE - IDEAL_FLIGHT_PRICE);
            flightPoints = ratio * MAX_FLIGHT_POINTS;
        }
        breakdown.flightPoints = flightPoints;
        score += (flightPoints * userPreferences.flightWeight);
    }

    // Cold Weather Points
    const wc = dailyWindchill(mnDay.temp, mnDay.wind_speed);
    let coldPoints = 0;
    if (wc <= 0) {
        coldPoints = MAX_COLD_POINTS;
    } else if (wc < 50) {
        let ratio = (50 - wc) / 50;
        coldPoints = ratio * MAX_COLD_POINTS;
    }
    breakdown.coldPoints = coldPoints;
    score += (coldPoints * userPreferences.coldWeight);

    // Vegas Weather Points
    const vegasAvg = vegasDay.temp;
    const vegasClear = vegasDay.condition === 'Clear' ? 1 : 0; 
    let tempDiffFromIdeal = Math.abs(vegasAvg - 75);
    let clearRatio = (vegasClear > 0) ? 1 : 0.5;
    let tempRatio = 1 - Math.min(tempDiffFromIdeal / 25, 1);
    let vegasPoints = MAX_CLEAR_POINTS * clearRatio * tempRatio;
    breakdown.vegasPoints = vegasPoints;
    score += (vegasPoints * userPreferences.vegasWeatherWeight);

    // Snow Points
    let snowRatio = Math.min(mnDay.snow / MAX_SNOW_INCHES, 1);
    let snowPoints = snowRatio * MAX_SNOW_POINTS;
    breakdown.snowPoints = snowPoints;
    score += (snowPoints * userPreferences.snowWeight);

    // Extra Snow Points
    let extraSnowPoints = (mnDay.snow >= 1) ? 2 : 0;
    breakdown.extraSnowPoints = extraSnowPoints;
    score += (extraSnowPoints * userPreferences.snowWeight);

    // Severe Weather Bonus
    if (isBeforeSevere) {
        breakdown.severeBonus = BEFORE_SEVERE_BONUS;
        score += (BEFORE_SEVERE_BONUS * userPreferences.beforeSevereWeight);
    }

    return { score, breakdown };
}

async function getLatLonForCity(cityName) {
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${process.env.OPENWEATHERMAP_API_KEY}`;
    const {data} = await axios.get(geoUrl);
    if (data.length === 0) return null;
    return { lat: data[0].lat, lon: data[0].lon };
}

async function get7DayForecast(cityName) {
    const coords = await getLatLonForCity(cityName);
    if (!coords) return null;

    const oneCallUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${coords.lat}&lon=${coords.lon}&exclude=hourly,minutely,current,alerts&units=imperial&appid=${process.env.OPENWEATHERMAP_API_KEY}`;
    const {data} = await axios.get(oneCallUrl);

    const forecast = data.daily.slice(0, 8).map(day => {
        const condition = day.weather[0].main;
        const icon = day.weather[0].icon;
        const temp = day.temp.day;
        const snow = day.snow ? day.snow : 0;
        const rain = day.rain ? day.rain : 0;
        const wind_speed = day.wind_speed;
        const dateStr = new Date(day.dt*1000).toLocaleDateString('en-US',{timeZone:'America/Chicago'});
        return {
            date: dateStr,
            temp,
            condition,
            snow,
            rain,
            wind_speed,
            icon
        };
    });

    return forecast;
}

async function getAmadeusAccessToken() {
    const tokenUrl = 'https://api.amadeus.com/v1/security/oauth2/token';
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_CLIENT_ID,
        client_secret: process.env.AMADEUS_CLIENT_SECRET
    });
    const {data} = await axios.post(tokenUrl, body.toString(), {
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    });
    return data.access_token;
}

async function getFilteredFlightOffers(origin, destination, dateISO) {
    const token = await getAmadeusAccessToken();
    if (!token) return [];
    const offersUrl = `https://api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${origin}&destinationLocationCode=${destination}&departureDate=${dateISO}&adults=1&nonStop=true&max=20&currencyCode=USD`;
    const {data} = await axios.get(offersUrl, {
        headers: {'Authorization': `Bearer ${token}`}
    });
    if (!data.data || data.data.length === 0) return [];

    let filtered = data.data.filter(offer => meetsCriteria(offer));
    if (filtered.length === 0) filtered = data.data;

    let sorted = filtered.map(o => {
        return {offer:o, price: parseFloat(o.price.grandTotal)};
    }).sort((a,b) => a.price - b.price);

    return sorted.slice(0,3).map(x => extractFlightInfo(x.offer));
}

function meetsCriteria(offer) {
    if (!offer.itineraries || offer.itineraries.length === 0) return false;
    const itinerary = offer.itineraries[0];
    if (!itinerary.segments || itinerary.segments.length === 0) return false;

    const firstSegment = itinerary.segments[0];
    const depTime = new Date(firstSegment.departure.at);
    const depHour = depTime.getHours();
    if (depHour < 6) return false; 

    const operatedByMajor = itinerary.segments.some(seg => MAJOR_AIRLINES.includes(seg.carrierCode));
    if (!operatedByMajor) return false;
    return true;
}

function extractFlightInfo(offer) {
    const price = parseFloat(offer.price.grandTotal);
    const itinerary = offer.itineraries[0];
    const firstSegment = itinerary.segments[0];

    const departureTime = new Date(firstSegment.departure.at).toLocaleString('en-US',{timeZone:'America/Chicago'});
    const arrivalTime = new Date(firstSegment.arrival.at).toLocaleString('en-US',{timeZone:'America/Chicago'});
    const carrier = firstSegment.carrierCode;
    const carrierName = AIRLINE_NAMES[carrier] || carrier;
    const flightNumber = firstSegment.number;

    return {
        price,
        departureTime,
        arrivalTime,
        carrierCode: carrier,
        carrier: carrierName,
        flightNumber
    };
}

function findSevereWeatherDay(mnForecast) {
    for (let i=1; i<=7; i++) {
        const d = mnForecast[i];
        const wc = dailyWindchill(d.temp, d.wind_speed);
        if (d.snow >= 4 || wc <= 0) {
            return i;
        }
    }
    return null;
}

async function findBestDay() {
    const vegasForecast = await get7DayForecast('Las Vegas');
    const minnesotaForecast = await get7DayForecast('Minneapolis');
    if (!vegasForecast || !minnesotaForecast) throw new Error("Failed to fetch weather data");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    const severeDay = findSevereWeatherDay(minnesotaForecast);

    let dayScores = [];

    for (let i=1; i<=7; i++) {
        const testDate = new Date(tomorrow.getTime());
        testDate.setDate(tomorrow.getDate()+(i-1));
        const dateISO = testDate.toISOString().split('T')[0];

        const outboundOffers = await getFilteredFlightOffers('MSP','LAS', dateISO);
        let bestOneWay = outboundOffers.length > 0 ? outboundOffers[0] : null;
        let chosenFlightPrice = bestOneWay ? bestOneWay.price : null;
        let chosenDetails = bestOneWay;
        let alternatives = outboundOffers.slice(1,3);

        let {score, breakdown} = computeScore(
            chosenFlightPrice,
            vegasForecast[i],
            minnesotaForecast[i],
            (severeDay !== null && i < severeDay)
        );

        dayScores.push({
            date: testDate.toLocaleDateString('en-US',{timeZone:'America/Chicago'}),
            score,
            flightPrice: chosenFlightPrice,
            flightDetails: chosenDetails,
            alternativeFlights: alternatives,
            breakdown
        });
    }

    let bestDay = dayScores.reduce((best, current) => current.score > best.score ? current : best, dayScores[0]);
    return {bestDay, dayScores, vegasForecast, minnesotaForecast};
}

// Backend endpoint
app.get('/api/bestday', async (req, res) => {
  try {
    const {bestDay, dayScores, vegasForecast, minnesotaForecast} = await findBestDay();
    // Return JSON for the frontend to display
    res.json({ bestDay, dayScores, vegasForecast, minnesotaForecast });
  } catch (e) {
    console.error(e);
    res.status(500).json({error: e.message});
  }
});

// Subscribe endpoint (for email)
app.post('/api/subscribe', (req, res) => {
  const {email} = req.body;
  // Not implemented: store email somewhere
  res.json({message: `Email ${email} subscribed. Persistence not implemented.`});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
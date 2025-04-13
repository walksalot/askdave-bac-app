from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Widmark formula constants
R_MALE = 0.68
R_FEMALE = 0.55
ALCOHOL_GRAMS_PER_DRINK = 10  # Standard drink definition (can be adjusted)
METABOLISM_RATE = 0.015  # Average BAC reduction per hour (% per hour)
KG_PER_LB = 0.453592


def calculate_bac(weight_kg, gender, total_drinks, hours):
    """Calculates estimated BAC using the Widmark formula.

    Args:
        weight_kg: Body weight in kilograms.
        gender: 'male' or 'female'.
        total_drinks: Total number of standard drinks consumed.
        hours: Time in hours since the first drink.

    Returns:
        A tuple (current_bac, peak_bac) or (None, None) if input is invalid.
    """
    try:
        weight_kg = float(weight_kg)
        total_drinks = float(total_drinks)
        hours = float(hours)

        if weight_kg <= 0 or total_drinks < 0 or hours < 0:
            raise ValueError("Inputs must be non-negative.")

        r = R_MALE if gender.lower() == "male" else R_FEMALE
        total_alcohol_grams = total_drinks * ALCOHOL_GRAMS_PER_DRINK

        # Calculate peak BAC (%)
        if weight_kg <= 0 or r <= 0:  # Avoid division by zero
            return 0.0, 0.0

        # Widmark formula: BAC % = (A / (W * R)) * 100
        # A = mass of alcohol in grams
        # W = body weight in grams (weight_kg * 1000)
        # R = gender constant
        peak_bac = (total_alcohol_grams / ((weight_kg * 1000) * r)) * 100

        # Account for metabolism over time
        current_bac = peak_bac - (METABOLISM_RATE * hours)

        # BAC cannot be negative
        current_bac = max(0, current_bac)
        return current_bac, peak_bac

    except (ValueError, TypeError) as e:
        print(f"Error in calculation: {e}")
        return None, None  # Indicate an error occurred


@app.route("/")
def index():
    """Serves the main calculator page."""
    # Pass empty dictionary for submitted_data on initial load
    return render_template("index.html", submitted_data={})


@app.route("/calculate", methods=["POST"])
def handle_calculation():
    """Handles form submission, calculates BAC, and returns JSON result."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request format. Expected JSON."}), 400

    try:
        weight_lbs = float(data.get("weight"))
        gender = data.get("gender")
        drinks_beer = float(data.get("drinks_beer", 0) or 0)
        drinks_wine = float(data.get("drinks_wine", 0) or 0)
        drinks_shot = float(data.get("drinks_shot", 0) or 0)
        hours = float(data.get("hours"))

        if None in [weight_lbs, gender, hours]:
            raise ValueError("Missing required fields: weight, gender, hours")
        if gender.lower() not in ["male", "female"]:
            raise ValueError("Invalid gender specified.")

        total_drinks = drinks_beer + drinks_wine + drinks_shot
        weight_kg = weight_lbs * KG_PER_LB

        current_bac, peak_bac = calculate_bac(weight_kg, gender, total_drinks, hours)

        if current_bac is not None:
            response_data = {
                "current_bac": f"{current_bac:.3f}",
                "peak_bac": peak_bac,
                "metabolism_rate": METABOLISM_RATE,
                "hours_since_first_drink": hours,
                "error": None,
            }
            return jsonify(response_data)
        else:
            return jsonify({"error": "Invalid input. Please check your values."}), 400

    except (ValueError, TypeError, KeyError) as e:
        # Handle missing/invalid fields or calculation errors
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        # General error handling
        print(f"Unexpected error: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500


# This block allows running the Flask development server locally
# Gunicorn will import the 'app' object directly in production
if __name__ == "__main__":
    # Keep debug=True for local development convenience,
    # but it won't be used by Gunicorn in production.
    print("Running in local development mode...")
    app.run(host="0.0.0.0", port=5001, debug=True)

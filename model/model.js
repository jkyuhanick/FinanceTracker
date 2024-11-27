// Chris Soplata
// Finance tracker model: functions

// Get types of spending as an array of objects
function getType() {
    const infolist = [
        {info:"Bill-payment"},
		{info: "Insurance-payment"},
		{info: "Subscription-service"},
		{info: "Shopping"},
		{info: "Groceries"},
		{info: "Paycheck"},
		{info: "Gift"}
    ];
    return infolist;
}

// Searches the type array using given information
function searchType(info) {
    var infolist = getType();
    for (let type of infolist){
        if (info === type.info){
            return type;
        }
    }
}

// Creates report
function createReport(amount, info) {
    var report = {};
    report.info = info;  

    report.amountString = amount.trim();

    // Parses the given amount to a number
    report.amount = parseFloat(amount.trim()); 

	var type =  searchType(report.info);
    if (type) { 
        report.info = searchType(report.info).info;
    }
	
    return report;
}

// Validate report
function validateReport(report) {
    var errors = {};

	 if (!searchType(report.info)) { 
        errors.TypeMissing = true;
    }
	
    // Validate amount, checks if value input is a positive number
    if (isNaN(report.amount) || !/^\d+(\.\d{1,2})?$/.test(report.amount)) {  
        errors.amountIllegal = true;           
    }

    return errors;
}

function getPrevious(report) {
    var previous = {};

    if (!report) { // If no prior order made, displays defaults
        previous.amount = "";    
        previous.types = getType();
        previous.info = "0";  // Default value for "Select Type of Transaction"
    }
    else {  // Redisplay existing values 
        previous.amount = report.amountString; // Redisplay original quantity in form

        // Get copy of book list
        var types = getType();
        for (let type of types) {
            // Search book based off of isbn, selects if found
            if (report.info === type.info) {
                type.selected = "selected";
            }
            else {
                type.selected = ""; 
            }        
        }
        previous.types = types;
    }
       
    return previous;
}

module.exports = {getType, searchType, createReport, validateReport, getPrevious};

// ============================================================================
// AIMBASE ANALYTICS & CAPTURE LIBRARY
// Tracking and lead capture for web analytics and CRM integration
// ============================================================================

// Initialize namespace if not already defined
if (Aimbase === undefined) { var Aimbase = {}; }
if (awaConfig === undefined) { var awaConfig = {}; }

// ============================================================================
// AIMBASE.ANALYTICS - Core tracking and session management
// ============================================================================
Aimbase.Analytics = (function (awaConfig) {

    // ========================================================================
    // PRIVATE: Configuration and State
    // ========================================================================
    var MAX_PARAM_LEN = 1024;
    var self = this;
    var clientId;
    var listeners = [];
    var lastPageVisitUid;
    var thisPageVisitUid;
    var currentSessionCookie;
    var currentScriptVersion = "1.1.162.17745";
    var currentUserUidCookie = "e11f23cd-caa6-4125-a4ce-63347f778ea5";
    
    var config = {
        cookieNamespace: 'Aimbase.Analytics',
        sessionTimeout: 20
    };

    // ========================================================================
    // PRIVATE: DOM & Script Element Access
    // ========================================================================
    
    /**
     * Gets the AimbaseAnalytics script tag element
     */
    var getScriptElement = function () {
        var el = document.getElementById('AimbaseAnalytics');
        return el;
    };

    /**
     * Gets an attribute value from the AimbaseAnalytics script tag
     * @param {string} name - Attribute name (e.g. 'data-clientId')
     */
    var getScriptElementVariable = function (name) {
        var el = getScriptElement();
        if (el && el.tagName.toUpperCase() == 'SCRIPT' && el.hasAttribute(name)) {
            return el.getAttribute(name);
        }
        return null;
    };

    /**
     * Extracts the service URL from the script source
     */
    var setServiceUrl = function () {
        var el = getScriptElement();
        var re = el.src.match(/^http(s)?:\/\/[a-z0-9-\.]+(\.[a-z0-9-]+)*?(:[0-9]+)?(\/)?/i);
        if (re != null) {
            config.serviceAddress = re[0];
        }
    };

    // ========================================================================
    // PRIVATE: Configuration & Object Utilities
    // ========================================================================

    /**
     * Merges two objects, with override values taking precedence
     */
    function mergeObjects(obj, override) {
        var obj3 = {};
        for (var attrname in obj) {
            obj3[attrname] = obj[attrname];
        }
        for (var attrname in override) {
            obj3[attrname] = override[attrname];
        }
        return obj3;
    }

    // ========================================================================
    // PRIVATE: Cookie Management
    // ========================================================================

    /**
     * Sets a cookie with optional expiration time
     * @param {string} name - Cookie name
     * @param {*} value - Cookie value (string or object)
     * @param {number} minutes - Minutes until expiration (optional)
     */
    var setCookie = function setCookie(name, value, minutes) {
        var expires;
        if (minutes) {
            var date = new Date();
            date.setTime(date.getTime() + (minutes * 60 * 1000));
            expires = "; expires=" + date.toGMTString();
        } else {
            expires = "; expires=" + new Date(2038, 1, 18).toGMTString();
        }

        var dataDomain = getDomain();
        var domain = "";
        if (dataDomain) {
            domain = ";domain=" + dataDomain;
        }

        document.cookie = config.cookieNamespace + "." + name + "=" + 
                         (typeof value == "string" ? value : JSON.stringify(value)) + 
                         expires + domain + "; path=/";
    };

    /**
     * Gets a cookie value by name
     * @param {string} name - Cookie name
     * @return {*} Parsed cookie value or null
     */
    var getCookie = function getCookie(name) {
        var nameEQ = config.cookieNamespace + "." + name + "=";
        var ca = document.cookie.split(';');
        
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1, c.length);
            }
            
            if (c.indexOf(nameEQ) == 0) {
                try {
                    return JSON.parse(c.substring(nameEQ.length, c.length));
                } catch (e) {
                    return c.substring(nameEQ.length, c.length);
                }
            }
        }
        return null;
    };

    // ========================================================================
    // PRIVATE: Script Metadata Access
    // ========================================================================

    /**
     * Gets the domain from script attribute
     */
    var getDomain = function () {
        return getScriptElementVariable('data-domain');
    };

    /**
     * Gets the manufacturer code from script attribute
     */
    var getManufacturer = function () {
        return getScriptElementVariable('data-mfg');
    };

    /**
     * Gets the dealer code from script attribute
     */
    var getDealer = function () {
        return getScriptElementVariable('data-dealer');
    };

    /**
     * Retrieves and validates the client ID from script attribute
     * Checks both 'data-clientId' (camelCase) and 'data-clientid' (lowercase) for compatibility
     */
    var setClientId = function () {
        clientId = getScriptElementVariable('data-clientId');
        // Fallback to lowercase version if camelCase not found
        if (clientId === null) {
            clientId = getScriptElementVariable('data-clientid');
        }
        if (clientId === null) {
            throw 'Could not find script element with id: "AimbaseAnalytics" and attribute: "data-clientId" or "data-clientid"';
        }
    };

    // ========================================================================
    // PRIVATE: URL Parameter Extraction
    // ========================================================================

    /**
     * Gets a query string parameter value
     * @param {string} name - Parameter name
     * @return {string} Decoded parameter value or empty string
     */
    var getParameterByName = function (name) {
        name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
        var results = regex.exec(location.search);
        return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    };

    /**
     * Generates a unique GUID
     */
    var generateGUID = function () {
        var crypt = window.crypto || window.msCrypto;
        if (crypt) {
            return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
                return (c ^ crypt.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
            });
        } else {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0;
                var v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
    };

    // ========================================================================
    // PRIVATE: Data Serialization
    // ========================================================================

    /**
     * Serializes an object into query string format
     * Truncates referrer if result exceeds MAX_PARAM_LEN
     */
    var serialize = function (obj, prefix, suffix) {
        var str = [];
        var p, key;
        
        for (p in obj) {
            if (obj.hasOwnProperty(p)) {
                key = p;
                if (Array.isArray(obj)) {
                    key = "Array_" + p;
                }
                
                var k = prefix ? prefix + "[" + key : key;
                var s = prefix ? suffix + "]" : "";
                var v = obj[p];
                
                str.push((v !== null && typeof v === "object") 
                    ? serialize(v, k, s) 
                    : encodeURIComponent(k + s) + "=" + encodeURIComponent(v));
            }
        }

        var result = str.join("&");
        
        // Truncate referrer if serialized string is too long
        if (result.length > MAX_PARAM_LEN && obj.ref) {
            var overage = result.length - MAX_PARAM_LEN;
            if (overage < obj.ref.length) {
                var newRefLen = obj.ref.length - overage;
                obj.ref = obj.ref.substr(0, newRefLen);
                return serialize(obj);
            }
        }
        
        return result;
    };

    // ========================================================================
    // PRIVATE: Session Management
    // ========================================================================

    /**
     * Validates if a session ID and timeout should be used
     */
    var canUseSessionIdParameter = function (timeout, id) {
        return id && id != '' && (!timeout || new Date() < new Date(parseInt(timeout)));
    };

    /**
     * Determines if current session cookie is from a new session
     */
    var isNewSession = function (sessionCookie, source, timeout) {
        if (sessionCookie === null) {
            return true;
        }
        
        if (source) {
            if (!sessionCookie.source || sessionCookie.source.toUpperCase() != source.toUpperCase()) {
                return true;
            }
        }
        
        return false;
    };

    /**
     * Initializes the session cookie with tracking parameters
     */
    var setupSessionCookie = function setupSessionCookie(id, timeout) {
        var sessionCookie = getCookie("Session");
        var parameters = getParameters();
        
        if (isNewSession(sessionCookie, parameters.source, timeout)) {
            // Create new session
            sessionCookie = {
                id: canUseSessionIdParameter(timeout, id) ? id : generateGUID()
            };
            
            // Copy URL parameters into session cookie
            for (var p in parameters) {
                if (sessionCookie[p] === undefined && parameters[p]) {
                    sessionCookie[p] = parameters[p];
                }
            }
            
            sessionCookie.lpvid = '';
            sessionCookie.ref = updateReferrer();
        }
        
        setSessionCookie(sessionCookie);
    };

    /**
     * Saves the session cookie and updates internal reference
     */
    var setSessionCookie = function (sessionCookie) {
        setCookie("Session", sessionCookie, config.sessionTimeout || 20);
        currentSessionCookie = sessionCookie;
    };

    /**
     * Rotates the last page visit UID with a new one
     */
    var rotatePageVisitUid = function (current) {
        var last = currentSessionCookie.lpvid;
        currentSessionCookie.lpvid = current;
        setCookie("Session", currentSessionCookie, config.sessionTimeout || 20);
        return last;
    };

    // ========================================================================
    // PRIVATE: Page Action Tracking
    // ========================================================================

    /**
     * Handler for element-based page actions (from event listeners)
     */
    var pageActionHandler = function (element, name, action, parameters, type, category, callback) {
        var elementId = null;
        if (element != undefined && typeof element == 'object' && element.id !== undefined) {
            elementId = element.id;
        }
        sendPageAction(elementId, name, action, parameters, type, category, callback);
    };

    /**
     * Sends a page action event to the tracking service
     */
    var sendPageAction = function (elementId, name, action, parameters, type, category, callback) {
        var actionObject = {};

        // Handle parameters
        if (parameters !== undefined && parameters !== null) {
            if (typeof parameters === 'object') {
                actionObject.params = encodeURIComponent(serialize(parameters));
            } else if (typeof parameters == 'string') {
                actionObject.params = encodeURIComponent(serialize({ string: parameters }));
            }
        }

        // Set optional fields (max 100 chars)
        if (elementId != undefined && elementId != null) {
            actionObject.element = elementId;
        }
        if (name != undefined && name != null) {
            actionObject.name = name.substring(0, 100);
        }
        if (type != undefined && type != null) {
            actionObject.type = type.substring(0, 100);
        }
        if (category != undefined && category != null) {
            actionObject.category = category.substring(0, 100);
        }
        
        actionObject.pvid = thisPageVisitUid;
        
        if (action != undefined && action != null) {
            actionObject.action = action.substring(0, 100);
        }
        
        actionObject.paid = generateGUID();

        // Send and callback
        pushData(actionObject, "api/pageaction");
        if (callback) {
            callback(actionObject);
        }
    };

    // ========================================================================
    // PRIVATE: URL Parameter Extraction (Campaign Attribution)
    // ========================================================================

    /**
     * Extracts all tracking parameters (UTM + custom)
     * Combines URL params, WST params, and referrer
     */
    var getParameters = function () {
        var parmsObject = getWstQueryStringValues();
        parmsObject.event = getParameterByName('event');
        parmsObject.medium = getParameterByName('utm_medium');
        parmsObject.campaign = getParameterByName('utm_campaign');
        parmsObject.source = getParameterByName('utm_source');
        parmsObject.term = getParameterByName('utm_term');
        parmsObject.content = getParameterByName('utm_content');
        parmsObject.ref = getReferrer();
        return parmsObject;
    };

    /**
     * Updates the stored referrer in the session cookie
     */
    var updateReferrer = function () {
        if (typeof currentSessionCookie !== "undefined") {
            delete currentSessionCookie.ref;
            currentSessionCookie.ref = getReferrer();
            return currentSessionCookie.ref;
        } else {
            return getReferrer();
        }
    };

    /**
     * Gets the referrer from session, URL param, or document.referrer
     */
    var getReferrer = function () {
        // Use cached referrer from session cookie if available
        if (typeof currentSessionCookie !== "undefined" && currentSessionCookie.ref) {
            return currentSessionCookie.ref;
        }
        
        // Check URL parameter
        var referrer = getParameterByName('ref');
        if (!referrer) {
            referrer = document.referrer;
        }
        
        return referrer;
    };

    // ========================================================================
    // PRIVATE: Page Visit Tracking
    // ========================================================================

    /**
     * Tracks a page visit and sends it to the analytics service
     */
    var trackPageVisit = function (callback, pageUrl, pageTitle) {
        var trackingObject = getParameters();
        
        // Don't resend referrer on subsequent visits
        if (currentSessionCookie.lpvid) {
            delete trackingObject.ref;
        }

        // Generate new page visit UID
        thisPageVisitUid = generateGUID();
        lastPageVisitUid = rotatePageVisitUid(thisPageVisitUid);

        // Add user and page metadata
        trackingObject.uid = currentUserUidCookie;
        trackingObject.title = pageTitle ?? document.title.substring(0, 100);

        // Send to service
        pushData(trackingObject, "api/pagevisit", callback, pageUrl);
    };

    // ========================================================================
    // PRIVATE: Data Transmission
    // ========================================================================

    /**
     * Sends tracking data to the AimBase service via image beacon
     */
    var pushData = function pushData(paramObject, path, callback, pageUrl) {
        // Add system parameters
        paramObject.cid = clientId;
        paramObject.ver = currentScriptVersion;
        paramObject.pvid = thisPageVisitUid;
        paramObject.lpvid = lastPageVisitUid;
        paramObject.rand = Math.random();
        paramObject.sid = currentSessionCookie.id;
        paramObject.pageUrl = encodeURIComponent(pageUrl ?? window.location.href);

        // Add optional dealer/manufacturer info
        var mfg = getManufacturer();
        if (mfg !== null) {
            paramObject.mfg = mfg;
        }

        var dealer = getDealer();
        if (dealer !== null) {
            paramObject.dealer = dealer;
        }

        // Send via image beacon (1x1 pixel)
        var img = new Image(1, 1);
        img.src = config.serviceAddress + path + "?" + serialize(paramObject);
        img.onload = function onImgLoad() {
            if (callback != undefined && typeof callback == "function") {
                callback();
            }
        };
    };

    // ========================================================================
    // PRIVATE: WST (WebStore Tracking) Parameter Extraction
    // ========================================================================

    /**
     * Gets all query string parameters starting with 'wst_'
     */
    var getWstQueryStringValues = function getWstQueryStringValues() {
        var vars = {};
        var hash;
        var workingName;
        var hashes = window.location.search.substr(1).split('&');

        for (var i = 0; i < hashes.length; i++) {
            hash = hashes[i].split('=');
            workingName = hash[0].toLowerCase();
            if (workingName.lastIndexOf('wst_', 0) === 0) {
                vars[hash[0]] = hash[1];
            }
        }

        return vars;
    };

    // ========================================================================
    // PRIVATE: User Product Segmentation
    // ========================================================================

    /**
     * Fetches product segment details for a user via POST request
     */
    var getUserProductSegmentDetails = function (userUid, dataClientId, callback) {
        var paramsObject = {};

        if (userUid != undefined && userUid != null) {
            paramsObject.WebUserId = userUid;
        } else {
            throw 'UserUid is required.';
        }

        if (dataClientId != undefined && dataClientId != null) {
            paramsObject.ClientId = dataClientId;
        } else {
            throw 'ClientId is required.';
        }

        postData(paramsObject, 'api/' + dataClientId + '/WebUserProductSegment', callback);
    };

    /**
     * Makes a POST request to the AimBase service
     */
    var postData = function postData(paramObject, path, callback) {
        var url = config.serviceAddress + path;
        var xhr = new XMLHttpRequest();

        xhr.open("POST", url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4) {
                if (callback != undefined && typeof callback == "function") {
                    callback(xhr.responseText);
                } else {
                    return xhr.responseText;
                }
            }
        };

        xhr.send(JSON.stringify(paramObject));
    };

    // ========================================================================
    // PRIVATE: Initialization
    // ========================================================================

    /**
     * Initializes the analytics library on page load
     */
    var init = function init() {
        setClientId();
        setServiceUrl();

        // Merge in any provided config
        if (awaConfig) {
            config = mergeObjects(config, awaConfig);
        }

        // Setup session with optional WST parameters
        setupSessionCookie(getParameterByName('wst_session'), getParameterByName('wst_timeout'));

        // Track this page visit
        trackPageVisit();
    };

    // Run initialization
    init();

    // ========================================================================
    // PUBLIC API
    // ========================================================================
    return {
        /**
         * Gets the current user UID
         */
        GetUserUid: function () {
            return currentUserUidCookie;
        },

        /**
         * Gets the current session UID
         */
        GetSessionUid: function () {
            return currentSessionCookie.id;
        },

        /**
         * Tracks a page visit (optional: specify URL and title)
         */
        SendPageVisit: function (pageUrl, pageTitle, callback) {
            trackPageVisit(callback, pageUrl, pageTitle);
        },

        /**
         * Sends a page action event
         */
        SendPageAction: function (elementId, name, action, parameters, callback) {
            sendPageAction(elementId, name, action, parameters, callback);
        },

        /**
         * Attaches an event listener to an element that triggers page actions
         */
        AddListener: function (element, name, action, parameters, type, category, callback) {
            if (!element) throw 'element not defined';

            var listener = {
                element: element,
                action: action,
                handler: function (e) {
                    pageActionHandler(element, name, action, parameters, type, category, callback);
                }
            };

            if (element.addEventListener) {
                element.addEventListener(action, listener.handler, false);
            } else if (element.attachEvent) {
                element.attachEvent(action, listener.handler);
            } else {
                throw 'Cannot attach event handler to element';
            }

            listeners.push(listener);
        },

        /**
         * Removes an event listener
         */
        RemoveListener: function (element, action) {
            if (!element) throw 'element not defined';

            var listener;
            for (var i = 0; i < listeners.length; i++) {
                if (listeners[i].element == element && listeners[i].action == action) {
                    listener = listeners[i];
                    listeners.splice(i, 1);
                    break;
                }
            }

            if (listener) {
                if (element.removeEventListener) {
                    element.removeEventListener(action, listener.handler, false);
                } else if (element.detachEvent) {
                    element.detachEvent(action, listener.handler);
                } else {
                    throw 'Cannot detach event handler from element';
                }
            }
        },

        /**
         * Gets a field value from session cookie or system field
         */
        GetFieldValue: function (name) {
            if (name == 'UserUid') {
                return this.GetUserUid();
            } else if (name == 'SessionUid') {
                return this.GetSessionUid();
            } else if (name == 'ClientId') {
                return clientId;
            } else if (currentSessionCookie[name] != undefined) {
                return currentSessionCookie[name];
            }
        },

        /**
         * Sets a field value in the session cookie
         */
        SetFieldValue: function (name, value) {
            currentSessionCookie[name] = value;
            setSessionCookie(currentSessionCookie);
        },

        /**
         * Test method for getting user product segment details
         */
        GetUserProductSegmentDetailsTest: function (userUid, clientid, callback) {
            getUserProductSegmentDetails(userUid, clientid, callback);
        },

        /**
         * Gets product segment details for the current user
         */
        GetUserProductSegmentDetails: function (callback) {
            var userUid = this.GetUserUid();
            if (userUid == undefined || userUid == null) {
                throw 'userUid not defined';
            }

            var clientid = this.GetFieldValue('ClientId');
            if (clientid == undefined || clientid == null) {
                throw 'clientid not defined';
            }

            getUserProductSegmentDetails(userUid, clientid, callback);
        },

        /**
         * Sets or generates a new user UID (resets session)
         */
        SetUserUid: function (uid) {
            if (uid === undefined || uid === null) {
                uid = generateGUID();
            }

            setCookie("User", uid, config.sessionTimeout || 20);
            currentUserUidCookie = uid;

            // Reset session to get fresh UTM params for new user
            setCookie("Session", null, config.sessionTimeout || 20);
            setupSessionCookie();
            trackPageVisit();
        }
    };

})(awaConfig);

// ============================================================================
// AIMBASE.CAPTURE - Lead capture with fluent builder pattern
// ============================================================================
Aimbase.Capture = (function (awaConfig) {

    // ========================================================================
    // PRIVATE: Page Action Transmission
    // ========================================================================

    /**
     * Sends a page action with capture data
     */
    var sendPageAction = function (pageAction) {
        Aimbase.Analytics.SendPageAction(null, null, 'capture', pageAction, null);
    };

    /**
     * Extracts array argument from function args
     */
    var getArrayArg = function (args) {
        if (args && args.length > 0 && Array.isArray(args[0])) {
            return args[0];
        }
        return null;
    };

    // ========================================================================
    // PUBLIC API - Convenience Methods
    // ========================================================================
    return {

        /**
         * Captures and sends profile information
         */
        SendProfile: function (firstName, lastName, email, countryCode, postalCode, 
                              address1, address2, city, state, homePhone, mobilePhone, 
                              workPhone, textOptIn, emailOptIn) {
            this.Start()
                .AddProfile(firstName, lastName, email, countryCode, postalCode, 
                           address1, address2, city, state, homePhone, mobilePhone, 
                           workPhone, textOptIn, emailOptIn)
                .Send();
        },

        /**
         * Captures dealer information
         */
        SendDealer: function (dealerNumber, dealerLocation, manufacturerCode) {
            this.Start()
                .AddDealer(dealerNumber, dealerLocation, manufacturerCode)
                .Send();
        },

        /**
         * Captures product information
         */
        SendProduct: function (code, name, modelYear, brandCode, manufacturerCode) {
            this.Start()
                .AddProduct(code, name, modelYear, brandCode, manufacturerCode)
                .Send();
        },

        /**
         * Captures product type
         */
        SendProductType: function (name) {
            this.Start()
                .AddProductType(name)
                .Send();
        },

        /**
         * Captures customer segment
         */
        SendSegment: function (name) {
            this.Start()
                .AddSegment(name)
                .Send();
        },

        /**
         * Captures campaign information
         */
        SendCampaign: function (name) {
            this.Start()
                .AddCampaign(name)
                .Send();
        },

        /**
         * Captures lead form submission with UTM attribution
         * Automatically includes stored UTM parameters from session cookie
         */
        SendLeadForm: function (leadType) {
            var pageAction = this.Start().AddLeadForm(leadType);
            
            // Extract and attach stored UTM parameters from session
            if (Aimbase.Analytics.GetFieldValue('source')) {
                pageAction.AddTag('utm_source', Aimbase.Analytics.GetFieldValue('source'));
            }
            if (Aimbase.Analytics.GetFieldValue('medium')) {
                pageAction.AddTag('utm_medium', Aimbase.Analytics.GetFieldValue('medium'));
            }
            if (Aimbase.Analytics.GetFieldValue('campaign')) {
                pageAction.AddTag('utm_campaign', Aimbase.Analytics.GetFieldValue('campaign'));
            }
            if (Aimbase.Analytics.GetFieldValue('utm_term')) {
                pageAction.AddTag('utm_term', Aimbase.Analytics.GetFieldValue('utm_term'));
            }
            if (Aimbase.Analytics.GetFieldValue('utm_content')) {
                pageAction.AddTag('utm_content', Aimbase.Analytics.GetFieldValue('utm_content'));
            }
            
            pageAction.Send();
        },

        /**
         * Captures page category/classification
         */
        SendPageCategory: function (code) {
            this.Start()
                .AddPageCategory(code)
                .Send();
        },

        /**
         * Captures arbitrary key-value tag
         */
        SendTag: function (name, value) {
            this.Start()
                .AddTag(name, value)
                .Send();
        },

        /**
         * Captures user identifier (email, phone, etc.)
         */
        SendIdentifier: function (id, type) {
            this.Start()
                .AddIdentifier(id, type)
                .Send();
        },

        // ====================================================================
        // FLUENT BUILDER - Allows chaining multiple data additions
        // ====================================================================

        /**
         * Creates a new fluent builder for chaining capture methods
         * Usage: Aimbase.Capture.Start().AddProfile(...).AddProduct(...).Send()
         */
        Start: function () {
            var fluent = {
                pageAction: {},

                /**
                 * Removes undefined properties from an object
                 */
                CleanObj: function (obj) {
                    Object.keys(obj).forEach(function (key) {
                        return obj[key] === undefined && delete obj[key];
                    });
                },

                /**
                 * Sends the accumulated page action data
                 */
                Send: function () {
                    sendPageAction(this.pageAction);
                },

                /**
                 * Adds profile information to this action
                 */
                AddProfile: function (firstName, lastName, email, countryCode, postalCode, 
                                     address1, address2, city, state, homePhone, mobilePhone, 
                                     workPhone, textOptIn, emailOptIn) {
                    this.pageAction.profile = {
                        "firstName": firstName,
                        "lastName": lastName,
                        "email": email,
                        "countryCode": countryCode,
                        "postalCode": postalCode,
                        "address1": address1,
                        "address2": address2,
                        "city": city,
                        "state": state,
                        "homePhone": homePhone,
                        "mobilePhone": mobilePhone,
                        "workPhone": workPhone,
                        "textOptIn": textOptIn,
                        "emailOptIn": emailOptIn
                    };
                    this.CleanObj(this.pageAction.profile);
                    return fluent;
                },

                /**
                 * Adds dealer information to this action
                 */
                AddDealer: function (dealerNumber, dealerLocation, manufacturerCode) {
                    this.pageAction.dealer = {
                        "dealerNumber": dealerNumber,
                        "dealerLocation": dealerLocation,
                        "manufacturerCode": manufacturerCode
                    };
                    this.CleanObj(this.pageAction.dealer);
                    return fluent;
                },

                /**
                 * Adds a product to the products array
                 */
                AddProduct: function (code, name, modelYear, brandCode, manufacturerCode) {
                    if (this.pageAction.products === undefined) {
                        this.pageAction.products = [];
                    }
                    var product = {
                        "code": code,
                        "name": name,
                        "modelYear": modelYear,
                        "brandCode": brandCode,
                        "manufacturerCode": manufacturerCode
                    };
                    this.CleanObj(product);
                    this.pageAction.products.push(product);
                    return fluent;
                },

                /**
                 * Adds a product type to the productTypes array
                 */
                AddProductType: function (name) {
                    if (this.pageAction.productTypes === undefined) {
                        this.pageAction.productTypes = [];
                    }
                    this.pageAction.productTypes.push(name);
                    return fluent;
                },

                /**
                 * Adds a customer segment to the segments array
                 */
                AddSegment: function (name) {
                    if (this.pageAction.segments === undefined) {
                        this.pageAction.segments = [];
                    }
                    this.pageAction.segments.push(name);
                    return fluent;
                },

                /**
                 * Adds a campaign to the campaigns array
                 */
                AddCampaign: function (name) {
                    if (this.pageAction.campaigns === undefined) {
                        this.pageAction.campaigns = [];
                    }
                    this.pageAction.campaigns.push(name);
                    return fluent;
                },

                /**
                 * Sets the lead form type and initializes leadForm object
                 */
                AddLeadForm: function (leadType) {
                    if (this.pageAction.leadForm === undefined) {
                        this.pageAction.leadForm = {};
                    }
                    this.pageAction.leadForm.leadType = leadType;
                    return fluent;
                },

                /**
                 * Sets the page category
                 */
                AddPageCategory: function (code) {
                    this.pageAction.pageCategory = code;
                    return fluent;
                },

                /**
                 * Adds an arbitrary key-value tag
                 */
                AddTag: function (name, value) {
                    if (this.pageAction.tags === undefined) {
                        this.pageAction.tags = {};
                    }
                    this.pageAction.tags[name] = value;
                    return fluent;
                },

                /**
                 * Sets user identifier and resets session if identifier changes
                 */
                AddIdentifier: function (id, type) {
                    var currentId = Aimbase.Analytics.GetFieldValue("identifier.id");
                    var currentType = Aimbase.Analytics.GetFieldValue("identifier.type");

                    if (this.pageAction.identifier === undefined) {
                        this.pageAction.identifier = {};
                    }

                    // Reset user session if identifier changes
                    if ((currentId !== undefined && currentId !== id) || 
                        (currentType !== undefined && currentType !== type)) {
                        Aimbase.Analytics.SetUserUid();
                    }

                    Aimbase.Analytics.SetFieldValue("identifier.id", id);
                    Aimbase.Analytics.SetFieldValue("identifier.type", type);

                    this.pageAction.identifier.id = id;
                    this.pageAction.identifier.type = type;

                    return fluent;
                }
            };

            return fluent;
        }
    };

})(awaConfig);
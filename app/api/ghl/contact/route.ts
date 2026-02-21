import { NextRequest, NextResponse } from "next/server";

// GHL predefined contact fields (top-level properties in the Create Contact API)
const GHL_PREDEFINED_FIELDS = new Set([
  "firstName", "lastName", "name", "email", "phone",
  "address1", "city", "state", "postalCode", "website",
  "timezone", "dateOfBirth", "gender", "country",
  "companyName", "source", "assignedTo",
]);

// Common form field name variations → GHL standard field name
const FIELD_NAME_MAP: Record<string, string> = {
  // firstName variants
  "first_name": "firstName",
  "first-name": "firstName",
  "firstname": "firstName",
  "fname": "firstName",
  "first": "firstName",

  // lastName variants
  "last_name": "lastName",
  "last-name": "lastName",
  "lastname": "lastName",
  "lname": "lastName",
  "last": "lastName",
  "surname": "lastName",

  // name variants
  "full_name": "name",
  "full-name": "name",
  "fullname": "name",
  "your-name": "name",
  "your_name": "name",

  // email variants
  "email_address": "email",
  "email-address": "email",
  "emailaddress": "email",
  "e-mail": "email",
  "mail": "email",
  "your-email": "email",
  "your_email": "email",

  // phone variants
  "phone_number": "phone",
  "phone-number": "phone",
  "phonenumber": "phone",
  "tel": "phone",
  "telephone": "phone",
  "mobile": "phone",
  "cell": "phone",
  "your-phone": "phone",
  "your_phone": "phone",

  // address variants
  "address": "address1",
  "street": "address1",
  "street_address": "address1",
  "street-address": "address1",

  // state variants
  "province": "state",
  "region": "state",

  // postalCode variants
  "postal_code": "postalCode",
  "postal-code": "postalCode",
  "zip": "postalCode",
  "zip_code": "postalCode",
  "zip-code": "postalCode",
  "zipcode": "postalCode",

  // website variants
  "url": "website",
  "site": "website",
  "web": "website",
  "homepage": "website",

  // dateOfBirth variants
  "date_of_birth": "dateOfBirth",
  "date-of-birth": "dateOfBirth",
  "dob": "dateOfBirth",
  "birthday": "dateOfBirth",
  "birth_date": "dateOfBirth",
  "birthdate": "dateOfBirth",

  // companyName variants
  "company_name": "companyName",
  "company-name": "companyName",
  "company": "companyName",
  "organization": "companyName",
  "org": "companyName",
  "business": "companyName",
};

/**
 * Normalize a form field name to a GHL predefined field name.
 * Returns the GHL field name if it matches, otherwise null (→ custom field).
 */
function normalizeFieldName(rawName: string): string | null {
  const name = rawName.trim();

  // Direct match (exact GHL field name)
  if (GHL_PREDEFINED_FIELDS.has(name)) {
    return name;
  }

  // Normalize: lowercase, spaces/hyphens → underscores
  const normalized = name.toLowerCase().replace(/[\s-]+/g, "_");

  if (FIELD_NAME_MAP[normalized]) {
    return FIELD_NAME_MAP[normalized];
  }

  return null;
}

/**
 * Convert a snake_case, camelCase, or kebab-case key into a Title Case display name.
 * e.g. "message" → "Message", "project_type" → "Project Type", "preferredDate" → "Preferred Date"
 */
function toDisplayName(key: string): string {
  return key
    // Insert space before uppercase letters in camelCase: "preferredDate" → "preferred Date"
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Replace underscores and hyphens with spaces
    .replace(/[_-]+/g, " ")
    // Title case each word
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Convert GHL API errors into user-friendly messages.
 * Never expose internal details like location IDs, sub-accounts, or GHL terminology.
 */
function toFriendlyError(
  status: number,
  data: Record<string, unknown>
): string {
  const rawMessage = typeof data.message === "string" ? data.message : "";
  const meta = (data.meta || {}) as Record<string, unknown>;
  const matchingField = typeof meta.matchingField === "string" ? meta.matchingField : "";

  // Duplicate contact
  if (rawMessage.toLowerCase().includes("duplicate")) {
    if (matchingField === "phone") {
      return "A contact with this phone number already exists.";
    }
    if (matchingField === "email") {
      return "A contact with this email address already exists.";
    }
    return "This contact already exists.";
  }

  // Validation errors
  if (status === 422 || rawMessage.toLowerCase().includes("validation")) {
    if (rawMessage.toLowerCase().includes("email")) {
      return "Please enter a valid email address.";
    }
    if (rawMessage.toLowerCase().includes("phone")) {
      return "Please enter a valid phone number.";
    }
    return "Some of the information provided is invalid. Please check and try again.";
  }

  // Auth / permission errors
  if (status === 401 || status === 403) {
    return "Something went wrong. Please try again later.";
  }

  // Rate limiting
  if (status === 429) {
    return "Too many submissions. Please wait a moment and try again.";
  }

  // Server errors
  if (status >= 500) {
    return "Something went wrong on our end. Please try again later.";
  }

  // Generic fallback — never pass raw GHL message to user
  return "Submission failed. Please try again.";
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.error("[GHL] Missing GHL_API_KEY or GHL_LOCATION_ID env vars");
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { fields, customFieldKeys, customFieldLabels } = body;

    console.log("[GHL] Incoming form fields:", JSON.stringify(fields, null, 2));
    if (customFieldKeys?.length) console.log("[GHL] Explicit custom field keys:", customFieldKeys);
    if (customFieldLabels && Object.keys(customFieldLabels).length) console.log("[GHL] Custom field labels:", customFieldLabels);

    if (!fields || typeof fields !== "object" || Object.keys(fields).length === 0) {
      console.warn("[GHL] No form fields provided");
      return NextResponse.json(
        { error: "Please fill in at least one field before submitting." },
        { status: 400 }
      );
    }

    // Set of field keys explicitly marked as custom via data-ghl-custom="true"
    const explicitCustomKeys = new Set<string>(
      Array.isArray(customFieldKeys) ? customFieldKeys : []
    );

    // Split fields into predefined (top-level) and custom
    const ghlPayload: Record<string, unknown> = {
      locationId,
    };
    const customFields: Array<{ key: string; field_value: unknown }> = [];

    for (const [rawKey, rawValue] of Object.entries(fields)) {
      // Skip country_code — it's already combined with phone by the bridge code
      if (rawKey === "country_code") continue;

      // Skip empty values
      const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
      if (value === "" || value === null || value === undefined) continue;

      // If explicitly marked as custom, always route to customFields
      if (explicitCustomKeys.has(rawKey)) {
        console.log(`[GHL] Custom field (explicit): "${rawKey}" = "${value}"`);
        customFields.push({
          key: rawKey,
          field_value: value,
        });
        continue;
      }

      const ghlField = normalizeFieldName(rawKey);
      if (ghlField) {
        console.log(`[GHL] Field mapped: "${rawKey}" → "${ghlField}" = "${value}"`);
        ghlPayload[ghlField] = value;
      } else {
        console.log(`[GHL] Custom field (unmapped): "${rawKey}" = "${value}"`);
        customFields.push({
          key: rawKey,
          field_value: value,
        });
      }
    }

    // Resolve custom field IDs from GHL (required for custom fields to be saved)
    if (customFields.length > 0) {
      console.log("[GHL] Fetching custom fields for location to resolve IDs...");
      try {
        const cfRes = await fetch(
          `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "Version": "2021-07-28",
              "Authorization": `Bearer ${apiKey}`,
            },
          }
        );

        if (cfRes.ok) {
          const cfData = await cfRes.json();
          const ghlCustomFields: Array<{ id: string; name: string; fieldKey: string }> =
            cfData.customFields || [];

          console.log(`[GHL] Found ${ghlCustomFields.length} custom fields in location`);

          // Build lookup maps: by fieldKey and by name (lowercase)
          const byKey = new Map<string, string>();
          const byName = new Map<string, string>();
          for (const cf of ghlCustomFields) {
            if (cf.fieldKey) byKey.set(cf.fieldKey.toLowerCase(), cf.id);
            if (cf.name) byName.set(cf.name.toLowerCase().replace(/[\s-]+/g, "_"), cf.id);
          }

          // Label map from bridge code: key → human-readable label (e.g. "project_type" → "Project Type")
          const labelMap: Record<string, string> = customFieldLabels && typeof customFieldLabels === "object"
            ? customFieldLabels
            : {};

          const resolvedCustomFields: Array<{ id: string; key: string; field_value: unknown }> = [];
          for (const cf of customFields) {
            const keyLower = cf.key.toLowerCase();
            const displayName = labelMap[cf.key] || toDisplayName(cf.key);
            const labelNormalized = displayName.toLowerCase().replace(/[\s-]+/g, "_");

            // Try matching by key, then by label name
            let cfId = byKey.get(keyLower) || byName.get(keyLower) || byName.get(labelNormalized);
            if (cfId) {
              console.log(`[GHL] Custom field resolved: "${cf.key}" (label: "${displayName}") → id="${cfId}"`);
            } else {
              // Auto-create the custom field in GHL using the human-readable label
              console.log(`[GHL] Custom field "${displayName}" not found — creating...`);
              try {
                const createRes = await fetch(
                  `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Accept": "application/json",
                      "Version": "2021-07-28",
                      "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                      name: displayName,
                      dataType: "TEXT",
                      model: "contact",
                    }),
                  }
                );
                if (createRes.ok) {
                  const createData = await createRes.json();
                  cfId = createData.customField?.id;
                  console.log(`[GHL] Custom field created: "${displayName}" → id="${cfId}"`);
                } else {
                  const errData = await createRes.json().catch(() => ({}));
                  console.error(`[GHL] Failed to create custom field "${displayName}":`, createRes.status, errData);
                }
              } catch (createErr) {
                console.error(`[GHL] Error creating custom field "${displayName}":`, createErr);
              }
            }
            if (cfId) {
              resolvedCustomFields.push({ id: cfId, key: cf.key, field_value: cf.field_value });
            }
          }

          if (resolvedCustomFields.length > 0) {
            ghlPayload.customFields = resolvedCustomFields;
          }
        } else {
          console.error("[GHL] Failed to fetch custom fields:", cfRes.status);
          // Fall through — send without IDs (GHL will likely ignore them)
          ghlPayload.customFields = customFields;
        }
      } catch (cfErr) {
        console.error("[GHL] Error fetching custom fields:", cfErr);
        ghlPayload.customFields = customFields;
      }
    }

    // GHL requires at least email or phone to create a contact
    if (!ghlPayload.email && !ghlPayload.phone) {
      return NextResponse.json(
        { error: "Please provide an email address or phone number." },
        { status: 422 }
      );
    }

    // GHL expects gender in lowercase ("male" / "female")
    if (ghlPayload.gender && typeof ghlPayload.gender === "string") {
      ghlPayload.gender = ghlPayload.gender.toLowerCase();
    }

    // Auto-compose "name" from firstName + lastName if not explicitly provided
    if (!ghlPayload.name && (ghlPayload.firstName || ghlPayload.lastName)) {
      ghlPayload.name = [ghlPayload.firstName, ghlPayload.lastName].filter(Boolean).join(" ");
    }

    // Add source tag so GHL contacts are traceable
    if (!ghlPayload.source) {
      ghlPayload.source = "Vibe Creator Funnel";
    }

    console.log("[GHL] Final payload to GHL API:", JSON.stringify(ghlPayload, null, 2));

    // Call GHL Create Contact API
    const ghlRes = await fetch("https://services.leadconnectorhq.com/contacts/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Version": "2021-07-28",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(ghlPayload),
    });

    let ghlData: Record<string, unknown> = {};
    try { ghlData = await ghlRes.json(); } catch { /* non-JSON response */ }
    console.log("[GHL] GHL API response:", ghlRes.status, JSON.stringify(ghlData, null, 2));

    if (!ghlRes.ok) {
      console.error("[GHL] Create contact failed:", ghlRes.status, ghlData);
      const friendlyMessage = toFriendlyError(ghlRes.status, ghlData);
      return NextResponse.json(
        { error: friendlyMessage },
        { status: ghlRes.status }
      );
    }

    console.log("[GHL] Contact created successfully:", (ghlData.contact as Record<string, unknown>)?.id);
    return NextResponse.json({
      success: true,
      contactId: (ghlData.contact as Record<string, unknown>)?.id,
    });
  } catch (error) {
    console.error("[GHL] Proxy error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}

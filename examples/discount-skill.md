# AI Skill: discount
- **ID**: discount-skill
- **Description**: Calculates and applies order discounts based on customer tier and order value, ensuring consistent and accurate discount handling.
- **System**: false
## Governance
- **Owner:** 4fab728a-67a9-41e6-8710-cc9912a788ab
- **Status:** Draft
- **Version:** 1.0.0
- **Last Updated:** 2026-03-03T20:41:50.257Z
- **Visibility:** internal

## Context
Project: Customer Service AI Deviation Testing
Context:

## Slices (Workflows)

### Slice: request return
**Role:** customer

#### Command: Request Discount
**Inputs:**
- CustomerId (Identifier)
- OrderValue (Numeric)

#### Scenarios / Business Rules
**Scenario:** scenario-h1xdak12t
- Then Outcomes:
  - Discount requested
    - CustomerId (Identifier)
    - OrderValue (Numeric)

### Slice: validate discount request
**Role:** ai

#### Command: validate discount request
**Inputs:**
- Discount (Numeric)

#### Query: discount request validated view
**Parameters:**
- Discount (Numeric)
  **Expected Outcomes:**
- guest discount calculated
- Member discount calculated
- VIP Discount Calculated

#### Automation: validate discount request automation

#### Scenarios / Business Rules
**Scenario:** scenario-z9nm4nxl0
- Then Outcomes:
  - Discount Response provided
    - Discount (Numeric)

**Scenario:** scenario-8cz7grc9p
- Then Outcomes:
  - Discount Response provided
    - Discount (Numeric)

**Scenario:** scenario-wwki8br4h
- Then Outcomes:
  - Discount Response provided
    - Discount (Numeric)

### Slice: validate customer tier
**Role:** system

#### Command: validate customer tier
**Inputs:**
- CustomerTier (Text)

#### Query: customer tier view
**Parameters:**
- CustomerId (Identifier)
  **Expected Outcomes:**
- Discount requested

#### Automation: validate customer tier automation
**Job:** Query Customer Tier
**Job Static Inputs:**
- collection: users
- returns: CustomerTier: {{user.tier}}
  **Job Input Mappings:**
- find ← CustomerId
  **Returns:** CustomerTier (Text)

#### Scenarios / Business Rules
**Scenario:** scenario-lqyztsp20
- Given: CustomerId = Null (not logged in / guest)
- Then Outcomes:
  - Customer tier validated
    - CustomerTier (Text) [Guest]

**Scenario:** scenario-e8qcy3bsl
- Given: CustomerId != Null (user logged in)
- When: User has matching tier assigned in DB
- Then Outcomes:
  - Customer tier validated
    - CustomerTier (Text)

**Scenario:** scenario-7hon9s0cm
- Given: CustomerID != Null (logged in)

- When: CustomerId does have matching tier in DB
- Error Path: Customer tier not found


### Slice: discount
**Role:** ai

#### Command: calculate discount
**Inputs:**
- Discount (Numeric)
- OrderValue (Numeric)

#### Query: calculate discount view
**Parameters:**
- CustomerTier (Text)
- OrderValue (Numeric)
  **Expected Outcomes:**
- Customer tier validated
- Discount requested

#### Automation: discount automation

#### Scenarios / Business Rules
**Scenario:** scenario-y949wdm3c
- When: Customer Tier = Member
  && orderValue >= 50
- Then Outcomes:
  - Member discount calculated
    - Discount (Numeric) [5]

**Scenario:** scenario-r7g5i2lh0
- When: Customer Tier = Member
  && orderValue < 50
- Then Outcomes:
  - Member discount calculated
    - Discount (Numeric) [0]

**Scenario:** scenario-62fwg7x2q
- When: Customer Tier = VIP
- Then Outcomes:
  - VIP Discount Calculated
    - Discount (Numeric) [10]

**Scenario:** scenario-gdlfwbirw
- Given: Customer Tier = Guest
- Then Outcomes:
  - guest discount calculated
    - Discount (Numeric) [0]

### Slice: Discount Response provided view

#### Query: discount response provided view
**Parameters:**
- Discount (Numeric)
  **Expected Outcomes:**
- Discount Response provided

#### Scenarios / Business Rules
**Scenario:** scenario-3foyemqvi

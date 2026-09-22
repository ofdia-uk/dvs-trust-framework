> [!CAUTION]
> This repository is a workspace copy for navigation, drafting, version control and collaboration. It is not the official statement of government policy and must not be relied on as such. For the official published policy, see the [UK digital verification services trust framework 1.0 on GOV.UK](https://www.gov.uk/government/publications/uk-digital-verification-services-trust-framework-1-0/uk-digital-verification-services-trust-framework-1-0-pre-release).

<a id="section-5"></a>

## 5. Rules for identity service providers

5.a. Identity service providers must follow these rules and those in [Part 3](../part-3/README.md#part-3).

<a id="section-5_1"></a>

### 5.1. Creating a digital identity

5.1.a. You must use the [‘How to check someone’s identity’ guidance](https://www.gov.uk/government/publications/how-to-check-someones-identity-1-0) as a methodology to explain your service. This is known as ‘Good Practice Guide’ (GPG) 45. You must demonstrate how each aspect of your service maps onto GPG 45, for instance by detailing the kinds of evidence and checking methods your service can use to reach a ‘medium’ level of confidence.

5.1.b. You must also be able to share this information with relying parties and other services you work with, if it is requested. This must include the relevant GPG 45 strength, validity, activity history, identity fraud and/or verification scores that your service can achieve, as well as how your service can combine them to reach different profiles and levels of confidence. You could do this by following [the trust framework data schema](https://www.gov.uk/government/publications/uk-digital-verification-services-trust-framework-data-schema-1-0).

5.1.c. If your service uses components from third parties, you must accurately describe how each component maps onto the relevant part of GPG 45. Using components sourced from certified [component service providers](09-rules-for-component-service-providers.md#section-9) may make it easier to demonstrate this.

5.1.d. If you work directly with relying parties, you must agree the level(s) of confidence or profile(s) that are suited to their needs and meet any contractual obligations that arise as a result.

<a id="section-5_2"></a>

### 5.2. Accepting expired evidence

5.2.a. You must not use expired evidence if you know in-date evidence is available which can be used to achieve the intended outcome (e.g., to meet a certain level of confidence or fulfil a regulatory need).

5.2.b. There is no obligation to accept expired evidence, but if you do choose to accept them, you must:

- demonstrate consideration of any legislation or guidance that may be relevant to a specific sector or use case; and

- only accept passports up to a maximum of 12 months after they have expired.

5.2.c. You could apply additional restrictions to your acceptance of expired evidence. For example, you may choose to only accept expired passports with near-field communication (NFC) chips issued by specific authorities, or for a maximum of 6 months. You could decide to set restrictions yourself, or they could be agreed with other organisations you work with, such as a relying party.

---

**Repository navigation**

[← Previous: 4. How organisations participate in the trust framework](../part-1/04-how-organisations-participate-in-the-trust-framework.md) · [Part README](README.md) · [Trust Framework 1.0](../README.md) · [Repository home](../../README.md) · [Next: 6. Rules for attribute service providers →](06-rules-for-attribute-service-providers.md)

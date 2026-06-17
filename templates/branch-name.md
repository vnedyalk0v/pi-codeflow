{{type}}/{{ticketPrefix}}{{slug}}

<!--
This template renders a semantic branch path from a structured branch payload.

Inputs:

- `type`
- `ticketPrefix` (empty or `TICKET-123-`)
- `slug`

Output rules:

- keep the type lowercase
- keep ticket IDs in their detected case
- keep the slug kebab-case
- do not include spaces
-->

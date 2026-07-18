# Checkout-service notes

The checkout endpoint looks up the shopper before applying a loyalty-tier price.

All successful checkout requests are structured-log events.

The database pool has a four-client limit for the demo.

Fault activation starts guest traffic so alerts are measured from completed and failed checkout log lines.

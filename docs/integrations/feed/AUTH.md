# Feed / dealer website: authentication

None by default. The address itself may carry a secret query parameter; it is stored in the dealer's configuration and always returned masked (`key=***`). Only https, never an internal network address (checked again after DNS, at most two redirects, 5 MB maximum).

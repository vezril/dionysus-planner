## ADDED Requirements

### Requirement: Categories nest by path and browse as a tree
A category MAY be a "/"-separated path (broad → narrow). The products
page SHALL offer a "By category" view rendering the nested tree with
products as leaf links (search prunes non-matching branches; products
without categories group under "Uncategorized"), and recipes SHALL
derive a tag for EVERY level name of their ingredients' category paths.

#### Scenario: Rhum styles
- **WHEN** two products carry "Rhum/Lightly Aged Pot Rhum" and one carries "Rhum/Agricole"
- **THEN** the tree shows Rhum with both styles nested and the right products under each, and a recipe using one derives both "Rhum" and its style as tags

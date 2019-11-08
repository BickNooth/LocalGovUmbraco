# Document Types
Document types define how umbraco is going to store your content. In a document type you define the properties that a piece of content has, and how that content is arranged and displayed to your editors. You can mix and combine document types meaning you can use the same document type settings on many different types of page. 

## DocType Tree
For the starterkit we have placed our document types into a structure that means properties can be inherited down the tree so you can make quick and simple changes to pages in one go. We have found this structure useful when building large sites as it lets you see how the doctypes fit together and gives you greater control over what the editors see.

### Components
Components are document types that form bits of bigger pages, in general umbraco document types map directly to a page, but occasionally it makes sense to have a document type for a bit of a page. 

Examples in the starter kit are opening times, and service alerts.

Opening times could be part of the parent page, but it makes it slightly easier to manage multiple times if they are separated.

Service alerts are small text banners that can be placed on any page on teh site, to alert people of an issue or problem - by making them components they can be managed outside of a page, and the same one can be put on multiple pages if needed. 

### Configuration
As your site grows you will find you need more and more settings, and configuration data, that needs to be accessed from all sorts of places. Creating a set of configuration doctypes allows you to store this information in your site. and quickly write code to go get it when needed. 

the Global Settings doctype is intended to live in the root of the site, and contain any things you might need across the site. 

### Pages
All of the document types that make up the pages of the site live under the pages node of the document type tree, here you can see all the different  types that make up the site. For simplicity and making it easier for content editors, we like to keep a one to one mapping of document types and templates.

## Compositions
Umbraco gives you two ways to combine document types, either via inheritance in a tree like structure, or through compositions where you can pick the doctypes you want. Each of these methods is powerful in its own way. For the starter kit, we have used a combination of tree inheritance so set the structure of the site, and compositions to add features to document types as needed. 

### Page Elements
All the compositions we use in the starter kit live in the page elements folder. these compositions help us to pick features that a page might have, such as contact details or related items. 

______
# Data Types
Datatypes form the core of how content is presented and stored in umbraco, A datatype defines the way the information is stored (as a string, or number, etc) and how the editor sees the data in the back office. 

For the starter kit, all the data types we use are stored in the folders, so you can see quickly what we have added to the base umbraco installation. When working with large sites we have found it makes sense to create new data types for each of the fields you have, rather than re-using existing ones. It does mean you have more types in the developer section, but it makes it easy to modify their behavior or change the editor type without affecting loads of extra stuff you didn't realise was linked. 

For the starter kit we have tried to keep it simple and not use to many 3rd party datatypes, because we want it to be nice and easy to understand whats going on. But to give you an idea of how flexible umbraco can be, and to make some of the things like the maps work we have included a few extra data types.

## Angular Google Maps
Displaying maps is something we almost always want to do at some point, the angular google maps datatype allows you to give your editors an easy way to locate something on a map, and store the data in a way you can then use.

## Opening Soon
Opening times can be complex, and a real pain - often people resort to putting them directly into the text editor, but by using a control, you can start to do clever things, like show only todays times, or work out what time something closes. It also means you can mark up the times in a way that google will read. 

## Styled Textbox
A simple data type that replaces the in built textbox with one you can add styles to. meaning you can make headings look like headings. It also has a character count and limit should you want to set it. 
_____
# Templates
Templates control the html markup of a site. Each template contains the information needed to render a specific document type. 

Templates are organised in a tree structure with lower templates inheriting from their parents. This makes it easy to control sitewide things like frameworks, and navigation, while giving you flexibility to render a page in whatever way you want. 

* Master
    * Design
        * Gateway Pages
        * Sections
            * Homepage
            * Section Homepage
        * SideNav Pages
            * Contact
            * Content
            * Dated Items
            * Listings
        * System
            * AtoZ
            * Searches
        * Venue Pages

Master
The master template sets the foundation for the site, we keep the master template to a minimum, it contains the code for the basics of the framework (bootstrap) and little else.

Design
the design template, sets out the layout of the site, navigation and footers. It doesn't dictate how content is laid out. any templates beneath this one have the full page to play with.

Side Nav Pages
Some pages do not need the full width for content and instead have some form of side navigation, this template sets out how the side navigation works .

Sections
Section pages are really just special gateway pages, that might contain some extra information, a header or news links. the homepage is an example of this.

System Pages
System pages aren't to different from other pages, but by giving them their own parent template we have the flexibility to change things if we need to, and it keeps them all in the same place. 
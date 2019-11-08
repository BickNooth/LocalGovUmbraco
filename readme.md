# Umbraco 7.15.3 Notes

## Installing Umbraco

The ideal editor for use with Umbraco is VS Code due to the available integrations. Firstly, ensure that IIS Express is installed on your system (check for folder C:\Program Files (x86)\IIS Express), then add the IIS Express extension for VS Code. To test this, open the parent folder for the Umbraco install in VS Code and press Ctrl+F5, this should launch an instance of IIS Express and take you to the Umbraco dashboard.

------
## Sections

The left hand navigation contains Sections, with the page being the Content section
* Items within the section are called a Tree, e.g. Content Tree
* Folders such as Home are called a node
* Each section has 1 or more dashboards containing valuable information for users of the system
* The search bar searches all of umbraco for matching results
	
	
### Content Section
The content section holds all of the pages and content for the website is held
* Content properties configure the information displayed on the content page
* The properties are pulled from the Document Type Template
* Properties are sorted into Tabs for organisation
	
Each node has 3 dots next to it which opens the context menu (also accessible through Right Click)
* From the context menu, additional pages can be added from the available page templates 
------
## Creating a new page
* Each page requires a page name and page title
* Before previewing the page, it must be saved as a draft using the arrow next to Save and Publish
* Once saved as a draft, this can then be previewed and published
	
### Media Library
* Images, documents and other files are stored in the Media section
* The media section contains three sections by default; Design, People and Products
  * The Design folder holds design related media like background images
* Within each folder, there is a document upload section along with an uploaded media gallery
  * Uploaded items have a bar when hovered, which takes you to the file details page
  * The info tab contains the path to the media item
  * Media items are stored in the database in a byte array (?)
  * The Media Picker is used to grab files from the design folder and display in content

### Document Types
Each page is created from a document type, defining the content structure
* The doc type defines where the page can be created and what properties it contains, along with the property input type
* Document Types are configured in the Settings section, under the Document Types node
  * Each type has an icon to help differentiate in the tree
  * The name of the template is shown when creating a new page
* Document Types are split into different views that can be accessed in the top right navigation
  * The Design view is used to configure properties which are in turn organised into tabs
  * Properties are the fields that the content editor can configure
* Properties are referenced based on name, and descriptions can also be added
* The property type is determined by the type of editor added
	* Textarea is standard for long texts
	* Each editor has predefined settings such as max char length, no. rows etc.
			
### Templates
The Razor Views style of templating in MVC can be applied in Umbraco through Templates. These can be found in their own node of the Settings Section tree.
* Document Types describe the content in a model context
* Templates describe the HTML Razor View 
  * This uses standard Razor syntax
  * It inherits models based on Document Type
  * Automatic styling is handled by Bootstrap 3

### Database
When using the default starter kit, or most downloaded kits, these will use a SQL Server Compact database, found in ``./App_Data/Umbraco.sdf``. 

For production environments, using the included SQL CE database file is not appropriate as with multiple users accessing the site the performance is too slow. There are a myriad of ways to convert this *.sdf into a fully fledged server, choose a method through google from a trusted site.

### Connection String 
The connection string is located in the projects root directory Web.config, in the ``<connectionStrings>`` section.
_______
## Starter Kits

In the Developer Section on the packages node, you can search for and install starter templates or import from a zip file. The rest of this document will be focused on the ``Localgov Starter Kit 6.0.4`` provided under an MIT License.
_______
## LocalGov Starter Kit

The LocalGov starter kit comes with no content, but provides a structure for similar use cases to a website for a Local Government. This includes structuring for the following;
* Templates
* DocTypes
* DataTypes
* Maps
* Navigation
* Search
* The Grid
* Styling

In addition, if the Starter Kit has been uninstalled when the LGSK is installed, you will also be provided with the option to import example data. 

### LG Document Types

[Doc types](#document-types) are organised into several folders and children. The Page Elements folders contains frequently used form options, such as contact details and related items.

Components, Configuration and Pages are configured as parent elements, holding properties to be inherited by all children. 
* Components are contructed from various page elements, and will not be shown in the navigation or AtoZ.
* Configuration contains standard configuration document types to assist with individual form config.
* The Pages node holds generic properties for child doc types. Changes made will affect all pages of this type.

### LG Templates

Preconfigured [templates](#templates) are included if you choose to import the example data from the package. These are built in the style of MVC Templates, employing Razor syntax.

Other folders within the project also contain components to assist with the View of pages. The Partial View folder holds repeatable html elements such as Opening Times, footer links. CSS files are held in their own folder, following the naming standard ``layout-pagename``. The Scripts folder holds the javascript files used throughout the solution.


_______
## Debugging

To debug using Visual Studio Code, press Ctrl+F5 - for more info see [Installing Umbraco](#Installing-Umbraco)

### Auto-fixing issues through the GUI

In the Developer section of the Umbraco site, there is a Health Check tab containing automated tests. Click the Check All Groups to receive a count of working elements and elements with issues. Most of these issues have a fix predefined, and a single press of the Fix button will resolve the issue.

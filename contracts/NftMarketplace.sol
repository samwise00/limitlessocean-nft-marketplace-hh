// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol"; // ERC721 interface
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

////////////////////
//     Errors     //
////////////////////

error NftMarketplace__NotOwner();
error NftMarketplace__NotApprovedForMarketplace();
error NftMarketplace__PriceMustBeAboveZero();
error NftMarketplace__NotEnoughEthSent();
error NftMarketplace__NotListed(address NftAddress, uint256 tokenId);
error NftMarketplace__AlreadyListed(address NftAddress, uint256 tokenId);
error NftMarketplace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);
error NftMarketplace__NoProceeds();
error NftMarketplace__WithdrawalUnsuccessful();

contract NftMarketplace is ReentrancyGuard {
    ////////////////////////////
    //  Variable Declarations //
    ////////////////////////////
    struct Listing {
        uint256 price;
        address seller;
    }
    /////////////
    //  Events //
    /////////////
    event ItemListed(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemBought(
        address indexed seller,
        address indexed buyer,
        address indexed nftAddress,
        uint256 tokenId,
        uint256 price
    );

    event ItemCanceled(address indexed nftAddress, uint256 indexed tokenId, address indexed owner);

    event ListingUpdated(
        address indexed seller,
        address indexed nftAddress,
        uint256 tokenId,
        uint256 newPrice
    );

    // Mapping of NFT listings
    // NFT Contract address -> NFT TokenID -> Listing
    mapping(address => mapping(uint256 => Listing)) private s_listings;

    // Seller address -> Amount earned
    mapping(address => uint256) private s_proceeds;

    ////////////////////
    //   Modifiers    //
    ////////////////////
    modifier notListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price > 0) {
            revert NftMarketplace__AlreadyListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isOwner(
        address nftAddress,
        uint256 tokenId,
        address spender
    ) {
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        // Check that the caller is the owner of the NFT
        require(owner == msg.sender, "Only the owner can list this NFT");
        if (spender != owner) {
            revert NftMarketplace__NotOwner();
        }
        _;
    }

    modifier isListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price <= 0) {
            revert NftMarketplace__NotListed(nftAddress, tokenId);
        }
        _;
    }

    ////////////////////
    // Main Functions //
    ////////////////////
    /*
     * @notice Method for listing NFT
     * @param nftAddress Address of NFT contract
     * @param tokenId Token ID of NFT
     * @param price sale price for each item
     */
    function listItem(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    ) external isOwner(nftAddress, tokenId, msg.sender) notListed(nftAddress, tokenId) {
        if (price <= 0) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }
        // Owners can still hold their NFT and give the marketplace approval to sell the NFT for them
        IERC721 nft = IERC721(nftAddress);
        if (nft.getApproved(tokenId) != address(this)) {
            revert NftMarketplace__NotApprovedForMarketplace();
        }
        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }

    function buyItem(
        address nftAddress,
        uint256 tokenId
    ) external payable isListed(nftAddress, tokenId) {
        Listing memory listedItem = s_listings[nftAddress][tokenId];
        if (msg.value < listedItem.price) {
            revert NftMarketplace__PriceNotMet(nftAddress, tokenId, listedItem.price);
        }
        IERC721 nft = IERC721(nftAddress);

        // seller account gets proceeds added
        s_proceeds[listedItem.seller] = s_proceeds[listedItem.seller] + msg.value;

        // deletes tokenId from listings mapping
        delete (s_listings[nftAddress][tokenId]);
        nft.safeTransferFrom(listedItem.seller, msg.sender, tokenId);

        emit ItemBought(listedItem.seller, msg.sender, nftAddress, tokenId, msg.value);
    }

    function cancelListing(
        address nftAddress,
        uint256 tokenId
    ) external isOwner(nftAddress, tokenId, msg.sender) isListed(nftAddress, tokenId) {
        delete (s_listings[nftAddress][tokenId]);
        emit ItemCanceled(nftAddress, tokenId, msg.sender);
    }

    function updateListing(
        address nftAddress,
        uint256 tokenId,
        uint256 newPrice
    ) external isOwner(nftAddress, tokenId, msg.sender) isListed(nftAddress, tokenId) {
        if (newPrice <= 0) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }
        Listing memory listedItem = s_listings[nftAddress][tokenId];
        listedItem.price = newPrice;

        emit ListingUpdated(msg.sender, nftAddress, tokenId, newPrice);
    }

    function withdrawProceeds() external {
        uint256 proceeds = s_proceeds[msg.sender];
        if (proceeds <= 0) {
            revert NftMarketplace__NoProceeds();
        }

        s_proceeds[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: proceeds}("");
        if (!success) {
            revert NftMarketplace__WithdrawalUnsuccessful();
        }
    }

    ////////////////////
    //   Getter Fxs   //
    ////////////////////

    function getListing(
        address nftAddress,
        uint256 tokenId
    ) external view returns (Listing memory) {
        return s_listings[nftAddress][tokenId];
    }

    function getProceeds(address seller) external view returns (uint256) {
        return s_proceeds[seller];
    }
}
